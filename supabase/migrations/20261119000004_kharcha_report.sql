-- Keep recipient details on the existing expense ledger. Historical rows stay
-- null instead of being assigned an invented person.
alter table public.expenses add column received_by text;
alter table public.expenses add constraint expenses_received_by_valid
  check (received_by is null or (
    received_by = btrim(received_by)
    and received_by ~ '[^[:space:]]'
    and char_length(received_by) <= 120
  ));

create index expenses_report_order_idx on public.expenses (expense_date, id);
create index expenses_report_recipient_idx on public.expenses (received_by, expense_date, id)
  where received_by is not null;

-- The report can cover the complete history, so it has no ten-year cap. Keep
-- validation in the database and use the farm's configured business date.
create function public.assert_kharcha_report_period(p_from date, p_to date)
returns void language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to > public.farm_today() then
    raise exception 'KHARCHA_REPORT_PERIOD_INVALID';
  end if;
end $$;

create function public.kharcha_report_date_bounds()
returns table (first_date date, last_date date)
language sql stable security invoker set search_path = public, pg_temp as $$
  select min(e.expense_date), public.farm_today()
  from public.expenses e
$$;

create function public.kharcha_report_summary(p_from date, p_to date, p_recipient text default null)
returns table (entry_count bigint, total_expenses numeric, farm_expenses numeric, home_expenses numeric, personal_expenses numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_recipient text := nullif(btrim(p_recipient), '');
begin
  perform public.assert_kharcha_report_period(p_from, p_to);
  return query
  with selected as (
    select e.amount,
      case when ec.is_farm_cost then 'farm'
           when lower(btrim(ec.name)) = 'ghar ka kharcha' then 'home'
           else 'personal' end as expense_type
    from public.expenses e
    join public.expense_categories ec on ec.id = e.category_id
    where e.expense_date between p_from and p_to
      and (v_recipient is null or e.received_by = v_recipient)
  )
  select count(*)::bigint, coalesce(sum(s.amount), 0),
    coalesce(sum(s.amount) filter (where s.expense_type = 'farm'), 0),
    coalesce(sum(s.amount) filter (where s.expense_type = 'home'), 0),
    coalesce(sum(s.amount) filter (where s.expense_type = 'personal'), 0)
  from selected s;
end $$;

create function public.kharcha_report_category_totals(p_from date, p_to date, p_recipient text default null)
returns table (category text, expense_type text, entry_count bigint, total_amount numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_recipient text := nullif(btrim(p_recipient), '');
begin
  perform public.assert_kharcha_report_period(p_from, p_to);
  return query
  select ec.name,
    case when ec.is_farm_cost then 'farm'
         when lower(btrim(ec.name)) = 'ghar ka kharcha' then 'home'
         else 'personal' end,
    count(*)::bigint, coalesce(sum(e.amount), 0)
  from public.expenses e
  join public.expense_categories ec on ec.id = e.category_id
  where e.expense_date between p_from and p_to
    and (v_recipient is null or e.received_by = v_recipient)
  group by ec.name, ec.is_farm_cost
  order by sum(e.amount) desc, ec.name;
end $$;

create function public.kharcha_report_people(p_from date, p_to date)
returns table (recipient text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_kharcha_report_period(p_from, p_to);
  return query
  select distinct e.received_by
  from public.expenses e
  where e.expense_date between p_from and p_to and e.received_by is not null
  order by e.received_by;
end $$;

create function public.kharcha_report_rows(
  p_from date, p_to date, p_recipient text default null,
  p_limit integer default 100, p_offset integer default 0
)
returns table (
  expense_id uuid, expense_date date, description text, category text,
  account text, expense_type text, amount numeric, recipient text
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_recipient text := nullif(btrim(p_recipient), '');
begin
  perform public.assert_kharcha_report_period(p_from, p_to);
  if p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset < 0 then
    raise exception 'KHARCHA_REPORT_PAGE_INVALID';
  end if;
  return query
  select e.id, e.expense_date, coalesce(nullif(btrim(e.note), ''), ec.name), ec.name, a.name,
    case when ec.is_farm_cost then 'farm'
         when lower(btrim(ec.name)) = 'ghar ka kharcha' then 'home'
         else 'personal' end,
    e.amount, e.received_by
  from public.expenses e
  join public.expense_categories ec on ec.id = e.category_id
  join public.accounts a on a.id = e.account_id
  where e.expense_date between p_from and p_to
    and (v_recipient is null or e.received_by = v_recipient)
  order by e.expense_date, ec.sort_order, ec.name, e.id
  limit p_limit offset p_offset;
end $$;

-- Recipient changes use the same guarded, revisioned audit path as other
-- expense corrections. Keep the original RPC intact for already deployed clients.
create function public.correct_expense_with_recipient(
  p_request_id uuid, p_id uuid, p_revision integer, p_date date,
  p_category uuid, p_account uuid, p_amount numeric, p_note text,
  p_received_by text, p_reason text
) returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_expense public.expenses%rowtype;
  v_audit public.expense_audit%rowtype;
  v_revision integer;
  v_recipient text := case when coalesce(p_received_by, '') ~ '^[[:space:]]*$' then null else btrim(p_received_by) end;
begin
  if p_request_id is null or p_id is null or p_revision is null or p_date is null
     or p_category is null or p_account is null or p_amount is null
     or p_amount <= 0 or p_amount <> round(p_amount, 2)
     or p_date > public.farm_today() or length(btrim(coalesce(p_reason, ''))) not between 5 and 500
     or char_length(v_recipient) > 120
     or exists (select 1 from public.expense_categories where id = p_category and is_salary) then
    raise exception 'EXPENSE_CORRECTION_INVALID' using errcode = 'P0001';
  end if;
  select * into v_expense from public.expenses where id = p_id for update;
  if not found then raise exception 'EXPENSE_STALE' using errcode = 'P0001'; end if;
  select * into v_audit from public.expense_audit where request_id = p_request_id;
  if found then
    if v_audit.expense_id <> p_id or (v_audit.before_row->>'revision')::integer <> p_revision
       or (v_audit.after_row->>'expense_date')::date <> p_date
       or (v_audit.after_row->>'category_id')::uuid <> p_category
       or (v_audit.after_row->>'account_id')::uuid <> p_account
       or (v_audit.after_row->>'amount')::numeric <> p_amount
       or v_audit.after_row->>'note' is distinct from nullif(btrim(p_note), '')
       or v_audit.after_row->>'received_by' is distinct from v_recipient
       or v_audit.reason <> btrim(p_reason) then
      raise exception 'EXPENSE_REQUEST_CHANGED' using errcode = 'P0001';
    end if;
    return (v_audit.after_row->>'revision')::integer;
  end if;
  if v_expense.revision <> p_revision then raise exception 'EXPENSE_STALE' using errcode = 'P0001'; end if;
  if v_expense.salary_period_id is not null or v_expense.staff_id is not null
     or exists (select 1 from public.health_events where expense_id = p_id) then
    raise exception 'EXPENSE_LINK_IMMUTABLE' using errcode = 'P0001';
  end if;
  perform set_config('app.correct_expense', 'on', true);
  perform set_config('app.expense_request_id', p_request_id::text, true);
  perform set_config('app.expense_reason', btrim(p_reason), true);
  update public.expenses set expense_date = p_date, category_id = p_category,
    account_id = p_account, amount = p_amount, note = nullif(btrim(p_note), ''), received_by = v_recipient
  where id = p_id returning revision into v_revision;
  return v_revision;
end $$;

revoke all on function public.assert_kharcha_report_period(date,date),
  public.kharcha_report_date_bounds(), public.kharcha_report_summary(date,date,text),
  public.kharcha_report_category_totals(date,date,text), public.kharcha_report_people(date,date),
  public.kharcha_report_rows(date,date,text,integer,integer),
  public.correct_expense_with_recipient(uuid,uuid,integer,date,uuid,uuid,numeric,text,text,text)
  from public, anon, authenticated;
grant execute on function public.assert_kharcha_report_period(date,date),
  public.kharcha_report_date_bounds(), public.kharcha_report_summary(date,date,text),
  public.kharcha_report_category_totals(date,date,text), public.kharcha_report_people(date,date),
  public.kharcha_report_rows(date,date,text,integer,integer),
  public.correct_expense_with_recipient(uuid,uuid,integer,date,uuid,uuid,numeric,text,text,text)
  to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.assert_kharcha_report_period(date,date),
      public.kharcha_report_date_bounds(), public.kharcha_report_summary(date,date,text),
      public.kharcha_report_category_totals(date,date,text), public.kharcha_report_people(date,date),
      public.kharcha_report_rows(date,date,text,integer,integer),
      public.correct_expense_with_recipient(uuid,uuid,integer,date,uuid,uuid,numeric,text,text,text)
      to anon;
  end if;
end $$;
