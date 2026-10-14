-- Keep closed accounts with a carried balance visible for reconciliation.
create or replace function public.account_month_summary(p_month date)
returns table (account_id uuid, name text, kind text, is_farm_cash boolean,
               opening numeric, money_in numeric, money_out numeric, closing numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  )
  select a.id, a.name, a.kind, a.is_farm_cash,
    o.opening, f.money_in, f.money_out, o.opening + f.money_in - f.money_out
  from public.accounts a cross join b
  cross join lateral (
    select coalesce(sum(money_in) filter (where entry_date >= b.m_start and entry_date < b.m_end), 0) as money_in,
           coalesce(sum(money_out) filter (where entry_date >= b.m_start and entry_date < b.m_end), 0) as money_out,
           coalesce(sum(money_in - money_out) filter (where entry_date < b.m_start), 0) as net_before
    from public.account_entries(a.id)) f
  cross join lateral (
    select case when a.opening_date < b.m_end then a.opening_balance else 0 end + f.net_before as opening) o
  where a.active or f.money_in <> 0 or f.money_out <> 0 or o.opening <> 0
  order by a.is_farm_cash desc, a.sort_order, a.name
$$;
