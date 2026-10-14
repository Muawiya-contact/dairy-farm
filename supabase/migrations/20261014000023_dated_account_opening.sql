-- Treat a mid-month account opening as a dated ledger movement. The previous
-- monthly summary counted it in the first-day balance, before the account existed.
create or replace function public.account_month_summary(p_month date)
returns table (account_id uuid, name text, kind text, is_farm_cash boolean,
               opening numeric, money_in numeric, money_out numeric, closing numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  )
  select a.id, a.name, a.kind, a.is_farm_cash,
         o.opening, m.money_in, m.money_out,
         o.opening + m.money_in - m.money_out
  from public.accounts a cross join b
  cross join lateral (
    select coalesce(sum(e.money_in) filter (where e.entry_date >= b.m_start and e.entry_date < b.m_end), 0) as money_in,
           coalesce(sum(e.money_out) filter (where e.entry_date >= b.m_start and e.entry_date < b.m_end), 0) as money_out,
           coalesce(sum(e.money_in - e.money_out) filter (where e.entry_date < b.m_start), 0) as net_before
    from public.account_entries(a.id) e) f
  cross join lateral (
    select case when a.opening_date <= b.m_start then a.opening_balance else 0 end + f.net_before as opening,
           case when a.opening_date > b.m_start and a.opening_date < b.m_end
                then a.opening_balance else 0 end as dated_opening) o
  cross join lateral (
    select f.money_in + greatest(o.dated_opening, 0) as money_in,
           f.money_out + greatest(-o.dated_opening, 0) as money_out) m
  where a.active or o.opening <> 0 or m.money_in <> 0 or m.money_out <> 0
  order by a.is_farm_cash desc, a.sort_order, a.name
$$;

create function public.trg_account_opening_date() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if new.opening_date > public.farm_today() then
    raise exception 'FUTURE_DATE: account ki opening tareekh aaj se aage nahi ho sakti' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger account_opening_date before insert or update of opening_date on public.accounts
  for each row execute function public.trg_account_opening_date();
