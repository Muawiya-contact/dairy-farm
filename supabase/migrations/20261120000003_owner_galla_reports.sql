-- Mark owner accounts explicitly and keep actor attribution on the existing
-- transfer ledger. Historical transfers retain a NULL actor.
alter table public.accounts
  add column is_owner boolean not null default false,
  add constraint accounts_owner_must_be_person check (not is_owner or kind = 'person');

alter table public.transfers
  add column created_by uuid references auth.users(id) on delete set null;

create index transfers_report_date_idx on public.transfers (transfer_date desc, id desc);

create function public.trg_transfer_actor()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by then
    -- Let the FK's nested ON DELETE SET NULL action preserve the transfer if
    -- its auth user is deleted; direct edits to the actor remain immutable.
    if new.created_by is null and pg_trigger_depth() > 1 then return new; end if;
    raise exception 'TRANSFER_ACTOR_IMMUTABLE';
  end if;
  return new;
end $$;
revoke all on function public.trg_transfer_actor() from public, anon, authenticated;
create trigger transfer_record_actor before insert or update on public.transfers
  for each row execute function public.trg_transfer_actor();

create function public.owner_transfer_bounds()
returns table (first_date date, last_date date)
language sql stable security invoker set search_path = public, pg_temp as $$
  with owner_transfers as (
    select t.transfer_date
    from public.transfers t
    join public.accounts farm on farm.id = t.from_account_id and farm.is_farm_cash
    join public.accounts owner_account on owner_account.id = t.to_account_id and owner_account.is_owner
    union all
    select t.transfer_date
    from public.transfers t
    join public.accounts owner_account on owner_account.id = t.from_account_id and owner_account.is_owner
    join public.accounts farm on farm.id = t.to_account_id and farm.is_farm_cash
  )
  select coalesce(min(transfer_date), public.farm_today()), public.farm_today()
  from owner_transfers
$$;

create function public.owner_transfer_summary(p_from date, p_to date)
returns table (
  total_withdrawals numeric, total_deposits numeric, net_amount numeric,
  withdrawal_count bigint, deposit_count bigint
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  -- Accounts Report offers true All Time, so do not apply the shared 10-year
  -- cap; only reject missing, reversed, or future periods.
  if p_from is null or p_to is null or p_from > p_to or p_to > public.farm_today() then
    raise exception 'REPORT_PERIOD_INVALID';
  end if;
  return query
  with selected as (
    select case when farm.id is not null then 'withdrawal' else 'deposit' end as direction,
      t.amount
    from public.transfers t
    left join public.accounts farm on farm.id = t.from_account_id and farm.is_farm_cash
    left join public.accounts owner_from on owner_from.id = t.from_account_id and owner_from.is_owner
    left join public.accounts owner_to on owner_to.id = t.to_account_id and owner_to.is_owner
    left join public.accounts farm_to on farm_to.id = t.to_account_id and farm_to.is_farm_cash
    where t.transfer_date between p_from and p_to
      and ((farm.id is not null and owner_to.id is not null)
        or (owner_from.id is not null and farm_to.id is not null))
  )
  select coalesce(sum(amount) filter (where direction = 'withdrawal'), 0),
    coalesce(sum(amount) filter (where direction = 'deposit'), 0),
    coalesce(sum(amount) filter (where direction = 'deposit'), 0)
      - coalesce(sum(amount) filter (where direction = 'withdrawal'), 0),
    count(*) filter (where direction = 'withdrawal'),
    count(*) filter (where direction = 'deposit')
  from selected;
end $$;

create function public.owner_transfer_rows(p_from date, p_to date, p_limit integer default 50, p_offset integer default 0)
returns table (
  transfer_id uuid, transfer_date date, direction text, amount numeric,
  owner_account_id uuid, owner_account_name text, farm_account_id uuid, farm_account_name text,
  note text, recorded_by uuid
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to > public.farm_today() then
    raise exception 'REPORT_PERIOD_INVALID';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 or p_offset is null or p_offset < 0 then
    raise exception 'OWNER_TRANSFER_PAGE_INVALID';
  end if;
  return query
  with selected as (
    select t.id as transfer_id, t.transfer_date, 'withdrawal'::text as direction, t.amount,
      owner_account.id as owner_account_id, owner_account.name as owner_account_name,
      farm.id as farm_account_id, farm.name as farm_account_name, t.note, t.created_by as recorded_by
    from public.transfers t
    join public.accounts farm on farm.id = t.from_account_id and farm.is_farm_cash
    join public.accounts owner_account on owner_account.id = t.to_account_id and owner_account.is_owner
    where t.transfer_date between p_from and p_to
    union all
    select t.id, t.transfer_date, 'deposit'::text, t.amount,
      owner_account.id, owner_account.name, farm.id, farm.name, t.note, t.created_by
    from public.transfers t
    join public.accounts owner_account on owner_account.id = t.from_account_id and owner_account.is_owner
    join public.accounts farm on farm.id = t.to_account_id and farm.is_farm_cash
    where t.transfer_date between p_from and p_to
  )
  select * from selected s
  order by s.transfer_date desc, s.transfer_id desc
  limit p_limit offset p_offset;
end $$;

create function public.galla_daily_closing(p_account uuid, p_date date)
returns table (
  account_id uuid, account_name text, opening_balance numeric, money_received numeric, money_paid numeric,
  owner_deposits numeric, owner_withdrawals numeric,
  internal_transfers_in numeric, internal_transfers_out numeric,
  other_transfers_in numeric, other_transfers_out numeric,
  expected_closing numeric, latest_count_id uuid, latest_count_date date,
  latest_counted_amount numeric, latest_count_difference numeric, latest_count_reason text,
  latest_count_is_stale boolean
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_account public.accounts;
begin
  if p_date is null or p_date > public.farm_today() then
    raise exception 'GALLA_DATE_INVALID';
  end if;
  select * into v_account from public.accounts where id = p_account and is_farm_cash;
  if not found then raise exception 'FARM_GALLA_REQUIRED'; end if;

  return query
  with daily as (
    select coalesce(sum(e.money_in), 0) as money_received,
      coalesce(sum(e.money_out), 0) as money_paid
    from public.account_entries(p_account) e where e.entry_date = p_date
  ), transfer_detail as (
    select
      coalesce(sum(t.amount) filter (where t.to_account_id = p_account and owner_from.id is not null), 0) as owner_deposits,
      coalesce(sum(t.amount) filter (where t.from_account_id = p_account and owner_to.id is not null), 0) as owner_withdrawals,
      coalesce(sum(t.amount) filter (where t.to_account_id = p_account and farm_from.id is not null and owner_from.id is null), 0) as internal_in,
      coalesce(sum(t.amount) filter (where t.from_account_id = p_account and farm_to.id is not null and owner_to.id is null), 0) as internal_out,
      coalesce(sum(t.amount) filter (where t.to_account_id = p_account and farm_from.id is null and owner_from.id is null), 0) as other_in,
      coalesce(sum(t.amount) filter (where t.from_account_id = p_account and farm_to.id is null and owner_to.id is null), 0) as other_out
    from public.transfers t
    left join public.accounts owner_from on owner_from.id = t.from_account_id and owner_from.is_owner
    left join public.accounts owner_to on owner_to.id = t.to_account_id and owner_to.is_owner
    left join public.accounts farm_from on farm_from.id = t.from_account_id and farm_from.kind in ('cash', 'bank')
    left join public.accounts farm_to on farm_to.id = t.to_account_id and farm_to.kind in ('cash', 'bank')
    where t.transfer_date = p_date and (t.from_account_id = p_account or t.to_account_id = p_account)
  ), latest_count as (
    select c.id, c.count_date, c.counted_amount, c.difference, c.reason, c.expected_balance,
      public.account_balance_on(c.account_id, c.count_date) as current_expected
    from public.cash_counts c
    where c.account_id = p_account and c.count_date <= p_date
    order by c.count_date desc, c.created_at desc, c.id desc
    limit 1
  )
  select p_account, v_account.name,
    public.account_balance_on(p_account, p_date - 1), daily.money_received, daily.money_paid,
    transfer_detail.owner_deposits, transfer_detail.owner_withdrawals,
    transfer_detail.internal_in, transfer_detail.internal_out,
    transfer_detail.other_in, transfer_detail.other_out,
    public.account_balance_on(p_account, p_date),
    latest_count.id, latest_count.count_date, latest_count.counted_amount,
    latest_count.difference, latest_count.reason,
    case when latest_count.id is null then null
      else latest_count.current_expected is distinct from latest_count.expected_balance end
  from daily cross join transfer_detail left join latest_count on true;
end $$;

revoke all on function public.owner_transfer_bounds(),
  public.owner_transfer_summary(date,date), public.owner_transfer_rows(date,date,integer,integer),
  public.galla_daily_closing(uuid,date) from public, anon, authenticated;
grant execute on function public.owner_transfer_bounds(),
  public.owner_transfer_summary(date,date), public.owner_transfer_rows(date,date,integer,integer),
  public.galla_daily_closing(uuid,date) to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.owner_transfer_bounds(),
      public.owner_transfer_summary(date,date), public.owner_transfer_rows(date,date,integer,integer),
      public.galla_daily_closing(uuid,date) to anon;
  end if;
end $$;
