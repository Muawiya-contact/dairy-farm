-- Daily stock is derived from saved production and deliveries. Waste is the
-- only explicit adjustment, so an unassigned litre is never silently lost.
create table public.milk_day_adjustments (
  milk_date date primary key,
  wasted_litres numeric(10,2) not null default 0 check (wasted_litres >= 0 and wasted_litres <= 5000),
  waste_reason text,
  updated_at timestamptz not null default now(),
  check ((wasted_litres = 0 and waste_reason is null) or (wasted_litres > 0 and char_length(trim(waste_reason)) between 3 and 500))
);
alter table public.milk_day_adjustments enable row level security;
create policy owner_all on public.milk_day_adjustments for all to authenticated using ((select private.is_app_owner())) with check ((select private.is_app_owner()));

create function public.milk_report_daily(p_from date, p_to date)
returns table (report_date date, opening_litres numeric, produced_litres numeric, sold_litres numeric, charity_litres numeric, wasted_litres numeric, closing_litres numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with days as (select d::date as report_date from generate_series(p_from, p_to, interval '1 day') d),
  produced as (select milk_date, sum(total_litres) litres from milk_shifts group by milk_date),
  delivered as (select d.delivery_date, sum(d.litres) sold, sum(d.litres) filter (where c.kind = 'free') charity from milk_deliveries d join customers c on c.id = d.customer_id group by d.delivery_date),
  movements as (select day.report_date, coalesce(p.litres,0) produced, coalesce(x.sold,0) sold, coalesce(x.charity,0) charity, coalesce(a.wasted_litres,0) wasted from days day left join produced p on p.milk_date=day.report_date left join delivered x on x.delivery_date=day.report_date left join milk_day_adjustments a on a.milk_date=day.report_date),
  opening as (select coalesce(sum(coalesce(p.litres,0)-coalesce(x.sold,0)-coalesce(a.wasted_litres,0)) filter (where d::date < p_from),0) value from generate_series(date '2000-01-01', p_from - 1, interval '1 day') d left join produced p on p.milk_date=d::date left join delivered x on x.delivery_date=d::date left join milk_day_adjustments a on a.milk_date=d::date)
  select m.report_date, o.value + coalesce(sum(m.produced-m.sold-m.wasted) over (order by m.report_date rows between unbounded preceding and 1 preceding),0), m.produced, m.sold-m.charity, m.charity, m.wasted, o.value + sum(m.produced-m.sold-m.wasted) over (order by m.report_date)
  from movements m cross join opening o order by m.report_date;
end $$;

revoke all on public.milk_day_adjustments from public, anon, authenticated;
grant select, insert, update on public.milk_day_adjustments to authenticated;
revoke all on function public.milk_report_daily(date,date) from public, anon, authenticated;
grant execute on function public.milk_report_daily(date,date) to authenticated;
do $$ begin if (select enabled from private.demo_access where id=1) then grant select, insert, update on public.milk_day_adjustments to anon; grant execute on function public.milk_report_daily(date,date) to anon; end if; end $$;
do $$ begin if (select enabled from private.demo_access where id=1) then
  create policy demo_all on public.milk_day_adjustments for all to anon using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
end if; end $$;
