-- Extend the existing Milk Report with the saved shift destinations and
-- payment dates. Keep stock and financial totals in PostgreSQL.
create function public.milk_report_distribution_daily(p_from date, p_to date)
returns table (
  report_date date, opening_litres numeric, produced_litres numeric, available_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric, farm_use_litres numeric,
  wasted_litres numeric, allocated_litres numeric, remaining_litres numeric,
  khata_delivery_amount numeric, company_bill_amount numeric, khata_amount numeric, cash_sale_amount numeric, total_sales_amount numeric,
  cash_received numeric, galla_cash_received numeric,
  free_details jsonb, farm_use_details jsonb, waste_details jsonb
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with daily as (
    select d.report_date, d.opening_litres, d.produced_litres, d.available_litres, d.closing_litres
    from public.milk_report_daily(p_from, p_to) d
  ), deliveries as (
    select d.delivery_date,
      coalesce(sum(d.litres) filter (where c.kind in ('regular','contractor','company')),0) khata_litres,
      coalesce(sum(d.litres) filter (where c.kind='cash'),0) cash_litres,
      coalesce(sum(d.litres) filter (where c.kind='free'),0) free_litres,
      coalesce(sum(d.litres),0) total_litres,
      coalesce(sum(d.amount) filter (where c.kind <> 'cash'),0) khata_amount,
      coalesce(sum(d.amount) filter (where c.kind='cash'),0) cash_sale_amount
    from public.milk_deliveries d
    join public.customers c on c.id=d.customer_id
    where d.delivery_date between p_from and p_to
    group by d.delivery_date
  ), dispositions as (
    select d.milk_date,
      coalesce(sum(d.litres) filter (where d.disposition_type='free'),0) free_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='wastage'),0) wasted_litres,
      coalesce(sum(d.litres),0) total_litres
    from public.milk_dispositions d
    where d.milk_date between p_from and p_to
    group by d.milk_date
  ), company_bills as (
    select b.to_date, coalesce(sum(b.amount),0) amount
    from public.company_bills b
    where b.to_date between p_from and p_to
    group by b.to_date
  ), payments as (
    select p.payment_date,
      coalesce(sum(p.amount) filter (where p.kind='payment'),0) cash_received,
      coalesce(sum(p.amount) filter (
        where p.kind='payment' and d.id is not null and c.kind='cash' and a.is_farm_cash
      ),0) galla_cash_received
    from public.payments p
    left join public.milk_deliveries d on d.id=p.delivery_id
    left join public.customers c on c.id=d.customer_id
    left join public.accounts a on a.id=p.account_id
    where p.payment_date between p_from and p_to
    group by p.payment_date
  ), detail_rows as (
    select d.delivery_date report_date, 'free'::text detail_type,
      jsonb_build_object('category',coalesce(c.free_reason,'legacy_free'),'recipient',c.name,'note',null,'litres',d.litres) detail
    from public.milk_deliveries d
    join public.customers c on c.id=d.customer_id
    where d.delivery_date between p_from and p_to and c.kind='free'
    union all
    select d.milk_date, d.disposition_type,
      jsonb_build_object('category',d.category,'recipient',d.recipient,'note',d.note,'litres',d.litres)
    from public.milk_dispositions d
    where d.milk_date between p_from and p_to
  ), details as (
    select x.report_date,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='free'),'[]'::jsonb) free_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='internal'),'[]'::jsonb) farm_use_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='wastage'),'[]'::jsonb) waste_details
    from detail_rows x
    group by x.report_date
  ), khata_balance as (
    select coalesce(sum(k.closing_balance) filter (where k.kind in ('regular','contractor','company')),0) amount
    from public.khata_period_summary(p_from,p_to) k
  )
  select d.report_date, d.opening_litres, d.produced_litres, d.available_litres,
    coalesce(x.khata_litres,0), coalesce(x.cash_litres,0),
    coalesce(x.free_litres,0)+coalesce(m.free_litres,0), coalesce(m.farm_use_litres,0), coalesce(m.wasted_litres,0),
    coalesce(x.total_litres,0)+coalesce(m.total_litres,0), d.closing_litres,
    coalesce(x.khata_amount,0), coalesce(b.amount,0), coalesce(x.khata_amount,0)+coalesce(b.amount,0), coalesce(x.cash_sale_amount,0),
    coalesce(x.khata_amount,0)+coalesce(b.amount,0)+coalesce(x.cash_sale_amount,0),
    coalesce(p.cash_received,0), coalesce(p.galla_cash_received,0),
    coalesce(t.free_details,'[]'::jsonb), coalesce(t.farm_use_details,'[]'::jsonb), coalesce(t.waste_details,'[]'::jsonb)
  from daily d
  left join deliveries x on x.delivery_date=d.report_date
  left join dispositions m on m.milk_date=d.report_date
  left join company_bills b on b.to_date=d.report_date
  left join payments p on p.payment_date=d.report_date
  left join details t on t.report_date=d.report_date
  cross join khata_balance
  order by d.report_date;
end $$;

create function public.milk_report_distribution_summary(p_from date, p_to date)
returns table (
  opening_litres numeric, produced_litres numeric, available_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric, farm_use_litres numeric,
  wasted_litres numeric, allocated_litres numeric, closing_litres numeric,
  khata_delivery_amount numeric, company_bill_amount numeric, khata_amount numeric, cash_sale_amount numeric, total_sales_amount numeric,
  cash_received numeric, galla_cash_received numeric, outstanding_khata_amount numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with daily as (
    select d.* from public.milk_report_distribution_daily(p_from,p_to) d
  ), khata_balance as (
    select coalesce(sum(k.closing_balance) filter (where k.kind in ('regular','contractor','company')),0) amount
    from public.khata_period_summary(p_from,p_to) k
  )
  select (array_agg(d.opening_litres order by d.report_date))[1], coalesce(sum(d.produced_litres),0),
    (array_agg(d.opening_litres order by d.report_date))[1]+coalesce(sum(d.produced_litres),0),
    coalesce(sum(d.khata_litres),0), coalesce(sum(d.cash_litres),0), coalesce(sum(d.free_litres),0),
    coalesce(sum(d.farm_use_litres),0), coalesce(sum(d.wasted_litres),0), coalesce(sum(d.allocated_litres),0),
    (array_agg(d.remaining_litres order by d.report_date desc))[1],
    coalesce(sum(d.khata_delivery_amount),0), coalesce(sum(d.company_bill_amount),0),
    coalesce(sum(d.khata_amount),0), coalesce(sum(d.cash_sale_amount),0), coalesce(sum(d.total_sales_amount),0),
    coalesce(sum(d.cash_received),0), coalesce(sum(d.galla_cash_received),0), k.amount
  from daily d cross join khata_balance k group by k.amount;
end $$;

create function public.milk_report_distribution_shifts(p_from date, p_to date)
returns table (
  report_date date, milk_shift text, produced_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric,
  farm_use_litres numeric, wasted_litres numeric, allocated_litres numeric, remaining_litres numeric,
  khata_delivery_amount numeric, cash_sale_amount numeric, cash_received numeric, galla_cash_received numeric,
  free_details jsonb, farm_use_details jsonb, waste_details jsonb
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with shifts as (
    select s.id, s.milk_date, s.shift, s.total_litres
    from public.milk_shifts s where s.milk_date between p_from and p_to
  ), deliveries as (
    select d.delivery_date,d.shift,
      coalesce(sum(d.litres) filter (where c.kind in ('regular','contractor','company')),0) khata_litres,
      coalesce(sum(d.litres) filter (where c.kind='cash'),0) cash_litres,
      coalesce(sum(d.litres) filter (where c.kind='free'),0) free_litres,
      coalesce(sum(d.litres),0) total_litres,
      coalesce(sum(d.amount) filter (where c.kind <> 'cash'),0) khata_amount,
      coalesce(sum(d.amount) filter (where c.kind='cash'),0) cash_sale_amount
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id
    where d.delivery_date between p_from and p_to group by d.delivery_date,d.shift
  ), dispositions as (
    select d.shift_id,
      coalesce(sum(d.litres) filter (where d.disposition_type='free'),0) free_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='wastage'),0) wasted_litres,
      coalesce(sum(d.litres),0) total_litres
    from public.milk_dispositions d join public.milk_shifts s on s.id=d.shift_id
    where s.milk_date between p_from and p_to group by d.shift_id
  ), payments as (
    select d.delivery_date,d.shift,
      coalesce(sum(p.amount) filter (where p.kind='payment' and p.payment_date=d.delivery_date),0) cash_received,
      coalesce(sum(p.amount) filter (where p.kind='payment' and p.payment_date=d.delivery_date and a.is_farm_cash),0) galla_cash_received
    from public.milk_deliveries d
    join public.customers c on c.id=d.customer_id and c.kind='cash'
    left join public.payments p on p.delivery_id=d.id
    left join public.accounts a on a.id=p.account_id
    where d.delivery_date between p_from and p_to group by d.delivery_date,d.shift
  ), detail_rows as (
    select d.delivery_date report_date,d.shift,'free'::text detail_type,
      jsonb_build_object('category',coalesce(c.free_reason,'legacy_free'),'recipient',c.name,'note',null,'litres',d.litres) detail
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id
    where d.delivery_date between p_from and p_to and c.kind='free'
    union all
    select d.milk_date,s.shift,d.disposition_type,
      jsonb_build_object('category',d.category,'recipient',d.recipient,'note',d.note,'litres',d.litres)
    from public.milk_dispositions d join public.milk_shifts s on s.id=d.shift_id
    where s.milk_date between p_from and p_to
  ), details as (
    select x.report_date,x.shift,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='free'),'[]'::jsonb) free_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='internal'),'[]'::jsonb) farm_use_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='wastage'),'[]'::jsonb) waste_details
    from detail_rows x group by x.report_date,x.shift
  )
  select s.milk_date,s.shift,s.total_litres,
    coalesce(d.khata_litres,0),coalesce(d.cash_litres,0),coalesce(d.free_litres,0)+coalesce(m.free_litres,0),
    coalesce(m.farm_use_litres,0),coalesce(m.wasted_litres,0),coalesce(d.total_litres,0)+coalesce(m.total_litres,0),
    s.total_litres-coalesce(d.total_litres,0)-coalesce(m.total_litres,0),
    coalesce(d.khata_amount,0),coalesce(d.cash_sale_amount,0),coalesce(p.cash_received,0),coalesce(p.galla_cash_received,0),
    coalesce(t.free_details,'[]'::jsonb),coalesce(t.farm_use_details,'[]'::jsonb),coalesce(t.waste_details,'[]'::jsonb)
  from shifts s
  left join deliveries d on d.delivery_date=s.milk_date and d.shift=s.shift
  left join dispositions m on m.shift_id=s.id
  left join payments p on p.delivery_date=s.milk_date and p.shift=s.shift
  left join details t on t.report_date=s.milk_date and t.shift=s.shift
  order by s.milk_date,case s.shift when 'morning' then 1 when 'noon' then 2 else 3 end;
end $$;

revoke all on function public.milk_report_distribution_daily(date,date),
  public.milk_report_distribution_summary(date,date),
  public.milk_report_distribution_shifts(date,date) from public, anon, authenticated;
grant execute on function public.milk_report_distribution_daily(date,date),
  public.milk_report_distribution_summary(date,date),
  public.milk_report_distribution_shifts(date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    grant execute on function public.milk_report_distribution_daily(date,date),
      public.milk_report_distribution_summary(date,date),
      public.milk_report_distribution_shifts(date,date) to anon;
  end if;
end $$;
