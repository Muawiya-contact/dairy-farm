-- Date-range reports use the saved ledger, never browser-calculated balances.
-- The upper bound is inclusive for the owner-facing form.
create or replace function public.assert_report_period(p_from date, p_to date)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'REPORT_PERIOD_INVALID';
  end if;
  if p_to - p_from > 3660 then
    raise exception 'REPORT_PERIOD_TOO_LONG';
  end if;
end $$;

create or replace function public.report_period_summary(p_from date, p_to date)
returns table (
  produced numeric, delivered numeric, sold_litres numeric, free_litres numeric,
  milk_income numeric, cash_collected numeric, other_income numeric,
  farm_expenses numeric, home_expenses numeric, profit numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with milk as (
    select
      coalesce((select sum(total_litres) from milk_shifts where milk_date between p_from and p_to), 0) as produced,
      coalesce(sum(d.litres), 0) as delivered,
      coalesce(sum(d.litres) filter (where c.kind <> 'free'), 0) as sold_litres,
      coalesce(sum(d.litres) filter (where c.kind = 'free'), 0) as free_litres,
      coalesce(sum(d.amount), 0) as delivery_income
    from milk_deliveries d join customers c on c.id = d.customer_id
    where d.delivery_date between p_from and p_to
  ), company as (
    select coalesce(sum(amount), 0) as income from company_bills where to_date between p_from and p_to
  ), collections as (
    select coalesce(sum(amount) filter (where kind = 'payment'), 0) as amount
    from payments where payment_date between p_from and p_to
  ), income as (
    select coalesce(sum(amount), 0) as amount from other_income where income_date between p_from and p_to
  ), costs as (
    select coalesce(sum(e.amount) filter (where ec.is_farm_cost), 0) as farm,
      coalesce(sum(e.amount) filter (where not ec.is_farm_cost), 0) as home
    from expenses e join expense_categories ec on ec.id = e.category_id
    where e.expense_date between p_from and p_to
  )
  select milk.produced, milk.delivered, milk.sold_litres, milk.free_litres,
    milk.delivery_income + company.income, collections.amount, income.amount,
    costs.farm, costs.home, milk.delivery_income + company.income + income.amount - costs.farm
  from milk, company, collections, income, costs;
end $$;

create or replace function public.report_period_customers(p_from date, p_to date)
returns table (
  customer_id uuid, name text, kind text, sort_order int, litres numeric,
  charged numeric, paid numeric, discount numeric, period_balance_change numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with d as (
    select customer_id, coalesce(sum(litres), 0) as litres, coalesce(sum(amount), 0) as charged
    from milk_deliveries where delivery_date between p_from and p_to group by customer_id
  ), b as (
    select customer_id, coalesce(sum(amount), 0) as charged
    from company_bills where to_date between p_from and p_to group by customer_id
  ), p as (
    select customer_id,
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'discount'), 0) as discount
    from payments where payment_date between p_from and p_to group by customer_id
  )
  select c.id, c.name, c.kind, c.sort_order,
    coalesce(d.litres, 0), coalesce(d.charged, 0), coalesce(p.paid, 0), coalesce(p.discount, 0),
    coalesce(d.charged, 0) + coalesce(b.charged, 0) - coalesce(p.paid, 0) - coalesce(p.discount, 0)
  from customers c
  left join d on d.customer_id = c.id
  left join b on b.customer_id = c.id
  left join p on p.customer_id = c.id
  where c.opening_date <= p_to and (c.active or coalesce(d.litres, 0) <> 0 or coalesce(d.charged, 0) <> 0
    or coalesce(b.charged, 0) <> 0 or coalesce(p.paid, 0) <> 0 or coalesce(p.discount, 0) <> 0)
  order by c.sort_order, c.name, c.id;
end $$;

create or replace function public.report_period_expenses(p_from date, p_to date)
returns table (expense_date date, category text, is_farm_cost boolean, account text, amount numeric, note text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  select e.expense_date, ec.name, ec.is_farm_cost, a.name, e.amount, e.note
  from expenses e
  join expense_categories ec on ec.id = e.category_id
  join accounts a on a.id = e.account_id
  where e.expense_date between p_from and p_to
  order by e.expense_date, ec.sort_order, ec.name, e.id;
end $$;

create or replace function public.customer_period_ledger(p_customer uuid, p_from date, p_to date)
returns table (entry_date date, entry_kind text, detail text, litres numeric, charge numeric, credit numeric, reference_id uuid)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  select d.delivery_date, 'delivery', case d.shift when 'morning' then 'Subah doodh' when 'noon' then 'Dopehr doodh' else 'Shaam doodh' end,
    d.litres, d.amount, 0::numeric, d.id
  from milk_deliveries d where d.customer_id = p_customer and d.delivery_date between p_from and p_to
  union all
  select b.to_date, 'company_bill', 'Company parchi (' || b.from_date || ' - ' || b.to_date || ')', b.litres, b.amount, 0::numeric, b.id
  from company_bills b where b.customer_id = p_customer and b.to_date between p_from and p_to
  union all
  select p.payment_date, p.kind, case when p.kind = 'discount' then 'Riayat' else 'Wusooli' end, null::numeric, 0::numeric, p.amount, p.id
  from payments p where p.customer_id = p_customer and p.payment_date between p_from and p_to
  order by 1, 2, 7;
end $$;

revoke all on function public.assert_report_period(date,date), public.report_period_summary(date,date),
  public.report_period_customers(date,date), public.report_period_expenses(date,date),
  public.customer_period_ledger(uuid,date,date) from public, anon, authenticated;
grant execute on function public.report_period_summary(date,date), public.report_period_customers(date,date),
  public.report_period_expenses(date,date), public.customer_period_ledger(uuid,date,date), public.assert_report_period(date,date) to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.report_period_summary(date,date), public.report_period_customers(date,date),
      public.report_period_expenses(date,date), public.customer_period_ledger(uuid,date,date), public.assert_report_period(date,date) to anon;
  end if;
end $$;
