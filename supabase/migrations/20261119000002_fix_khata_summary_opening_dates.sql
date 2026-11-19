-- A customer's saved opening balance takes effect on its opening date, not at
-- the start of every report that happens to include that customer.
drop function public.khata_year_month_summary(int);
drop function public.khata_period_summary(date, date);

create function public.khata_period_summary(p_from date, p_to date)
returns table (
  customer_id uuid, name text, kind text, active boolean, sort_order int,
  litres numeric, charges numeric, payments numeric, discounts numeric, refunds numeric,
  opening_balance numeric, opening_added numeric, closing_balance numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with lines as (
    select d.customer_id, d.delivery_date as entry_date, d.litres, d.amount as charge, 0::numeric as payment, 0::numeric as discount, 0::numeric as refund from milk_deliveries d
    union all select b.customer_id, b.to_date, b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric from company_bills b
    union all select p.customer_id, p.payment_date, null::numeric, 0::numeric, case when p.kind = 'payment' then p.amount else 0::numeric end, case when p.kind = 'discount' then p.amount else 0::numeric end, case when p.kind = 'refund' then p.amount else 0::numeric end from payments p
  ), totals as (
    select c.id as customer_id, c.name, c.kind, c.active, c.sort_order,
      coalesce(sum(l.litres) filter (where l.entry_date between p_from and p_to), 0) as litres,
      coalesce(sum(l.charge) filter (where l.entry_date between p_from and p_to), 0) as charges,
      coalesce(sum(l.payment) filter (where l.entry_date between p_from and p_to), 0) as payments,
      coalesce(sum(l.discount) filter (where l.entry_date between p_from and p_to), 0) as discounts,
      coalesce(sum(l.refund) filter (where l.entry_date between p_from and p_to), 0) as refunds,
      case when c.opening_date < p_from then c.opening_balance else 0::numeric end + coalesce(sum(l.charge - l.payment - l.discount + l.refund) filter (where l.entry_date < p_from), 0) as opening_balance,
      case when c.opening_date between p_from and p_to then c.opening_balance else 0::numeric end as opening_added
    from customers c left join lines l on l.customer_id = c.id where c.opening_date <= p_to
    group by c.id, c.name, c.kind, c.active, c.sort_order, c.opening_date, c.opening_balance
  )
  select t.customer_id, t.name, t.kind, t.active, t.sort_order, t.litres, t.charges, t.payments, t.discounts, t.refunds,
    t.opening_balance, t.opening_added, t.opening_balance + t.opening_added + t.charges - t.payments - t.discounts + t.refunds
  from totals t
  where t.opening_balance <> 0 or t.opening_added <> 0 or t.litres <> 0 or t.charges <> 0 or t.payments <> 0 or t.discounts <> 0 or t.refunds <> 0
  order by t.sort_order, t.name, t.customer_id;
end $$;

create function public.khata_year_month_summary(p_year int)
returns table (month_start date, litres numeric, charges numeric, payments numeric, discounts numeric, refunds numeric, closing_balance numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  with months as (
    select d::date as month_start, (d + interval '1 month - 1 day')::date as month_end
    from generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') d where d::date <= farm_today()
  )
  select m.month_start, coalesce(sum(s.litres), 0), coalesce(sum(s.charges), 0), coalesce(sum(s.payments), 0), coalesce(sum(s.discounts), 0), coalesce(sum(s.refunds), 0), coalesce(sum(s.closing_balance), 0)
  from months m left join lateral public.khata_period_summary(m.month_start, least(m.month_end, farm_today())) s on true
  group by m.month_start order by m.month_start
$$;

revoke all on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) from public, anon, authenticated;
grant execute on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) to anon;
  end if;
end $$;
