-- Keep the opening-day balance in that day's cash movement so the daily
-- reconciliation follows account_month_summary's dated-opening convention.
create or replace function public.galla_daily_closing(p_account uuid, p_date date)
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
    select coalesce(sum(e.money_in), 0)
        + case when v_account.opening_date = p_date then greatest(v_account.opening_balance, 0) else 0 end as money_received,
      coalesce(sum(e.money_out), 0)
        + case when v_account.opening_date = p_date then greatest(-v_account.opening_balance, 0) else 0 end as money_paid
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
