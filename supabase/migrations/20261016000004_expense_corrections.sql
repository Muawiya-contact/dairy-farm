-- A manual expense correction is versioned and audited. Salary and linked
-- health costs keep their dedicated immutable workflows.
alter table public.expenses add column revision integer not null default 1 check (revision > 0);

create table public.expense_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  expense_id uuid not null,
  before_row jsonb not null,
  after_row jsonb not null,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  actor_id uuid,
  changed_at timestamptz not null default clock_timestamp()
);
create index expense_audit_expense_idx on public.expense_audit(expense_id, changed_at desc);
alter table public.expense_audit enable row level security;
create policy owner_read on public.expense_audit for select to authenticated using ((select private.is_app_owner()));
revoke all on public.expense_audit from public, anon, authenticated;
grant select on public.expense_audit to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.expense_audit to anon;
    create policy demo_read on public.expense_audit for select to anon using ((select private.demo_access_enabled()));
  end if;
end $$;
create trigger subscription_write_guard before insert or update or delete on public.expense_audit
for each row execute function private.guard_subscription_write();

create function public.guard_manual_expense_change() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.salary_period_id is not null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' or current_setting('app.correct_expense', true) is distinct from 'on' then
    raise exception 'EXPENSE_USE_CORRECTION' using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id or new.staff_id is distinct from old.staff_id
     or new.salary_period_id is distinct from old.salary_period_id
     or new.quantity is distinct from old.quantity or new.unit is distinct from old.unit then
    raise exception 'EXPENSE_LINK_IMMUTABLE' using errcode = 'P0001';
  end if;
  new.revision := old.revision + 1;
  return new;
end $$;
create trigger manual_expense_change before update or delete on public.expenses
for each row execute function public.guard_manual_expense_change();

create function public.audit_manual_expense_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.salary_period_id is not null then return null; end if;
  insert into public.expense_audit(request_id, expense_id, before_row, after_row, reason, actor_id)
  values (current_setting('app.expense_request_id', true)::uuid, old.id, to_jsonb(old), to_jsonb(new),
    current_setting('app.expense_reason', true), auth.uid());
  return null;
end $$;
revoke all on function public.audit_manual_expense_change() from public, anon, authenticated;
create trigger audit_manual_expense_after after update on public.expenses
for each row execute function public.audit_manual_expense_change();

create function public.correct_expense(
  p_request_id uuid, p_id uuid, p_revision integer, p_date date,
  p_category uuid, p_account uuid, p_amount numeric, p_note text, p_reason text
) returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_expense public.expenses%rowtype; v_audit public.expense_audit%rowtype; v_revision integer;
begin
  if p_request_id is null or p_id is null or p_revision is null or p_date is null
     or p_category is null or p_account is null or p_amount is null
     or p_amount <= 0 or p_amount <> round(p_amount, 2)
     or p_date > public.farm_today() or length(btrim(coalesce(p_reason, ''))) not between 5 and 500
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
    account_id = p_account, amount = p_amount, note = nullif(btrim(p_note), '')
    where id = p_id returning revision into v_revision;
  return v_revision;
end $$;
revoke all on function public.correct_expense(uuid,uuid,integer,date,uuid,uuid,numeric,text,text) from public, anon, authenticated;
grant execute on function public.correct_expense(uuid,uuid,integer,date,uuid,uuid,numeric,text,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.correct_expense(uuid,uuid,integer,date,uuid,uuid,numeric,text,text) to anon;
  end if;
end $$;
