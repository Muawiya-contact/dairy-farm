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
create trigger subscription_write_guard before insert or update or delete on public.milk_day_adjustments
for each row execute function private.guard_subscription_write();

create function public.trg_milk_day_adjustment_validate()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_opening numeric;
  v_produced numeric;
  v_delivered numeric;
begin
  if tg_op = 'UPDATE' and new.milk_date <> old.milk_date then
    raise exception 'MILK_WASTE_DATE_IMMUTABLE';
  end if;
  if new.milk_date > public.farm_today() then raise exception 'FUTURE_DATE'; end if;
  if exists (select 1 from public.month_locks where month = date_trunc('month', new.milk_date)::date) then
    raise exception 'MONTH_LOCKED';
  end if;

  select coalesce(sum(movement.produced - movement.delivered - movement.wasted), 0)
    into v_opening
  from (
    select d.movement_date,
      coalesce(p.litres, 0) produced,
      coalesce(x.litres, 0) delivered,
      coalesce(a.wasted_litres, 0) wasted
    from (
      select milk_date as movement_date from public.milk_shifts where milk_date < new.milk_date
      union select delivery_date from public.milk_deliveries where delivery_date < new.milk_date
      union select milk_date from public.milk_day_adjustments where milk_date < new.milk_date
    ) d
    left join (select milk_date, sum(total_litres) litres from public.milk_shifts where milk_date < new.milk_date group by milk_date) p on p.milk_date = d.movement_date
    left join (select delivery_date, sum(litres) litres from public.milk_deliveries where delivery_date < new.milk_date group by delivery_date) x on x.delivery_date = d.movement_date
    left join public.milk_day_adjustments a on a.milk_date = d.movement_date
  ) movement;

  select coalesce(sum(total_litres), 0) into v_produced
  from public.milk_shifts where milk_date = new.milk_date;
  select coalesce(sum(litres), 0) into v_delivered
  from public.milk_deliveries where delivery_date = new.milk_date;

  if new.wasted_litres > greatest(v_opening + v_produced - v_delivered, 0) then
    raise exception 'MILK_WASTE_EXCEEDS_AVAILABLE';
  end if;
  return new;
end $$;
create trigger milk_day_adjustment_validate before insert or update on public.milk_day_adjustments
for each row execute function public.trg_milk_day_adjustment_validate();

create function public.save_milk_day_waste(p_date date, p_wasted_litres numeric, p_reason text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_date is null or p_wasted_litres is null or p_wasted_litres < 0
     or p_wasted_litres > 5000 or p_wasted_litres <> round(p_wasted_litres, 2) then
    raise exception 'MILK_WASTE_INVALID';
  end if;
  if p_date > public.farm_today() then raise exception 'FUTURE_DATE'; end if;
  if p_wasted_litres > 0 and char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'MILK_WASTE_REASON_REQUIRED';
  end if;
  if p_wasted_litres = 0 then p_reason := null; else p_reason := trim(p_reason); end if;

  insert into public.milk_day_adjustments(milk_date, wasted_litres, waste_reason, updated_at)
  values (p_date, p_wasted_litres, p_reason, now())
  on conflict (milk_date) do update set
    wasted_litres = excluded.wasted_litres,
    waste_reason = excluded.waste_reason,
    updated_at = excluded.updated_at;
end $$;

create function public.milk_report_date_bounds()
returns table (first_date date, last_date date)
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(min(d.report_day), public.farm_today()), coalesce(max(d.report_day), public.farm_today())
  from (
    select milk_date as report_day from public.milk_shifts
    union all select delivery_date from public.milk_deliveries
    union all select milk_date from public.milk_day_adjustments
  ) d
$$;

create function public.milk_report_daily(p_from date, p_to date)
returns table (report_date date, opening_litres numeric, produced_litres numeric, available_litres numeric, sold_litres numeric, charity_litres numeric, wasted_litres numeric, waste_reason text, closing_litres numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with days as (select d::date as report_date from generate_series(p_from, p_to, interval '1 day') d),
  produced as (select milk_date, sum(total_litres) litres from milk_shifts where milk_date <= p_to group by milk_date),
  delivered as (select d.delivery_date, sum(d.litres) total, sum(d.litres) filter (where c.kind = 'free') charity from milk_deliveries d join customers c on c.id = d.customer_id where d.delivery_date <= p_to group by d.delivery_date),
  movements as (select dates.report_date, coalesce(p.litres,0) produced, coalesce(x.total,0) delivered, coalesce(x.charity,0) charity, coalesce(a.wasted_litres,0) wasted, a.waste_reason from days dates left join produced p on p.milk_date=dates.report_date left join delivered x on x.delivery_date=dates.report_date left join milk_day_adjustments a on a.milk_date=dates.report_date),
  prior_days as (
    select milk_date as movement_date from milk_shifts where milk_date < p_from
    union select delivery_date from milk_deliveries where delivery_date < p_from
    union select milk_date from milk_day_adjustments where milk_date < p_from
  ),
  opening as (
    select coalesce(sum(coalesce(p.litres,0) - coalesce(x.litres,0) - coalesce(a.wasted_litres,0)),0) value
    from prior_days d
    left join (select milk_date, sum(total_litres) litres from milk_shifts where milk_date < p_from group by milk_date) p on p.milk_date=d.movement_date
    left join (select delivery_date, sum(litres) litres from milk_deliveries where delivery_date < p_from group by delivery_date) x on x.delivery_date=d.movement_date
    left join milk_day_adjustments a on a.milk_date=d.movement_date
  ),
  balances as (
    select m.report_date, m.produced, m.delivered, m.charity, m.wasted, m.waste_reason,
      o.value + coalesce(sum(m.produced-m.delivered-m.wasted) over (order by m.report_date rows between unbounded preceding and 1 preceding),0) opening,
      o.value + sum(m.produced-m.delivered-m.wasted) over (order by m.report_date) closing
    from movements m cross join opening o
  )
  select b.report_date, b.opening, b.produced, b.opening+b.produced, b.delivered-b.charity, b.charity, b.wasted, b.waste_reason, b.closing
  from balances b order by b.report_date;
end $$;

create function public.milk_report_customers(p_from date, p_to date)
returns table (customer_id uuid, name text, kind text, sort_order int, litres numeric, charged numeric, paid numeric, outstanding numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with period_customers as (
    select r.customer_id, r.name, r.kind, r.sort_order, r.litres, r.charged, r.paid
    from public.report_period_customers(p_from, p_to) r
  ), balances as (
    select k.customer_id, k.name, k.kind, k.sort_order, k.closing_balance
    from public.khata_period_summary(p_from, p_to) k
  )
  select coalesce(p.customer_id, k.customer_id), coalesce(p.name, k.name), coalesce(p.kind, k.kind),
    coalesce(p.sort_order, k.sort_order), coalesce(p.litres,0), coalesce(p.charged,0), coalesce(p.paid,0), coalesce(k.closing_balance,0)
  from period_customers p full join balances k on k.customer_id=p.customer_id
  order by coalesce(p.sort_order,k.sort_order), coalesce(p.name,k.name), coalesce(p.customer_id,k.customer_id);
end $$;

create function public.milk_report_summary(p_from date, p_to date)
returns table (opening_litres numeric, produced_litres numeric, available_litres numeric, sold_litres numeric, charity_litres numeric, wasted_litres numeric, closing_litres numeric, sales_amount numeric, received_amount numeric, outstanding_amount numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with daily as (select * from public.milk_report_daily(p_from,p_to)), customers as (select * from public.milk_report_customers(p_from,p_to)), customer_totals as (
    select coalesce(sum(c.charged),0) sales, coalesce(sum(c.paid),0) received, coalesce(sum(c.outstanding),0) outstanding from customers c
  )
  select (array_agg(d.opening_litres order by d.report_date))[1], coalesce(sum(d.produced_litres),0),
    (array_agg(d.opening_litres order by d.report_date))[1] + coalesce(sum(d.produced_litres),0),
    coalesce(sum(d.sold_litres),0), coalesce(sum(d.charity_litres),0), coalesce(sum(d.wasted_litres),0),
    (array_agg(d.closing_litres order by d.report_date desc))[1],
    t.sales, t.received, t.outstanding
  from daily d cross join customer_totals t group by t.sales, t.received, t.outstanding;
end $$;

create function public.milk_report_animals(p_from date, p_to date, p_animal uuid default null)
returns table (report_date date, animal_id uuid, tag text, name text, morning_litres numeric, noon_litres numeric, evening_litres numeric, total_litres numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if p_animal is not null and not exists (select 1 from public.animals where id = p_animal) then
    raise exception 'ANIMAL_NOT_FOUND';
  end if;
  if p_animal is not null then
    return query with days as (select d::date report_day from generate_series(p_from, p_to, interval '1 day') d),
    animal_days as (
      select ms.milk_date, am.animal_id,
        sum(am.litres) filter (where ms.shift = 'morning') morning,
        sum(am.litres) filter (where ms.shift = 'noon') noon,
        sum(am.litres) filter (where ms.shift = 'evening') evening
      from public.animal_milk am join public.milk_shifts ms on ms.id=am.shift_id
      where ms.milk_date between p_from and p_to and am.animal_id=p_animal
      group by ms.milk_date, am.animal_id
    )
    select d.report_day, a.id, a.tag, coalesce(a.name, ''), coalesce(x.morning,0), coalesce(x.noon,0), coalesce(x.evening,0), coalesce(x.morning,0)+coalesce(x.noon,0)+coalesce(x.evening,0)
    from days d cross join public.animals a left join animal_days x on x.milk_date=d.report_day and x.animal_id=a.id
    where a.id=p_animal order by d.report_day;
  else
    return query with animal_days as (
      select ms.milk_date, a.id, a.tag, coalesce(a.name, '') animal_name,
        coalesce(sum(am.litres) filter (where ms.shift = 'morning'),0) morning,
        coalesce(sum(am.litres) filter (where ms.shift = 'noon'),0) noon,
        coalesce(sum(am.litres) filter (where ms.shift = 'evening'),0) evening
      from public.animal_milk am join public.milk_shifts ms on ms.id=am.shift_id
      join public.animals a on a.id=am.animal_id
      where ms.milk_date between p_from and p_to
      group by ms.milk_date, a.id, a.tag, a.name
    )
    select x.milk_date, x.id, x.tag, x.animal_name, x.morning, x.noon, x.evening, x.morning+x.noon+x.evening
    from animal_days x order by x.milk_date, x.tag, x.id;
  end if;
end $$;

create function public.milk_report_animals_summary(p_from date, p_to date, p_animal uuid default null)
returns table (animal_id uuid, tag text, name text, morning_litres numeric, noon_litres numeric, evening_litres numeric, total_litres numeric, recorded_days bigint, is_grand_total boolean)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if p_animal is not null and not exists (select 1 from public.animals where id = p_animal) then
    raise exception 'ANIMAL_NOT_FOUND';
  end if;
  return query with production as (
    select am.animal_id,
      coalesce(sum(am.litres) filter (where ms.shift='morning'),0) morning,
      coalesce(sum(am.litres) filter (where ms.shift='noon'),0) noon,
      coalesce(sum(am.litres) filter (where ms.shift='evening'),0) evening,
      count(distinct ms.milk_date) recorded_days
    from public.animal_milk am join public.milk_shifts ms on ms.id=am.shift_id
    where ms.milk_date between p_from and p_to and (p_animal is null or am.animal_id=p_animal)
    group by am.animal_id
  ), animal_rows as (
    select a.id, a.tag, coalesce(a.name,'' ) animal_name, coalesce(p.morning,0) morning,
      coalesce(p.noon,0) noon, coalesce(p.evening,0) evening,
      coalesce(p.morning,0)+coalesce(p.noon,0)+coalesce(p.evening,0) total,
      coalesce(p.recorded_days,0) recorded_days
    from public.animals a left join production p on p.animal_id=a.id
    where (p_animal is not null and a.id=p_animal) or (p_animal is null and p.animal_id is not null)
  ), grand as (
    select coalesce(sum(morning),0) morning, coalesce(sum(noon),0) noon, coalesce(sum(evening),0) evening,
      coalesce(sum(animal_rows.total),0) total,
      (select count(distinct ms.milk_date)::bigint
        from public.animal_milk am join public.milk_shifts ms on ms.id=am.shift_id
        where ms.milk_date between p_from and p_to and (p_animal is null or am.animal_id=p_animal)) recorded_days
    from animal_rows
  )
  select report_rows.animal_id, report_rows.tag, report_rows.name, report_rows.morning_litres,
    report_rows.noon_litres, report_rows.evening_litres, report_rows.total_litres,
    report_rows.recorded_days, report_rows.is_grand_total
  from (
    select r.id animal_id, r.tag, r.animal_name name, r.morning morning_litres, r.noon noon_litres,
      r.evening evening_litres, r.total total_litres, r.recorded_days, false is_grand_total from animal_rows r
    union all select null::uuid, '—', 'Grand Total', g.morning, g.noon, g.evening, g.total, g.recorded_days, true from grand g
  ) report_rows
  order by report_rows.is_grand_total, report_rows.tag;
end $$;

revoke all on public.milk_day_adjustments from public, anon, authenticated;
grant select, insert, update on public.milk_day_adjustments to authenticated;
revoke all on function public.milk_report_daily(date,date), public.milk_report_customers(date,date), public.milk_report_summary(date,date), public.milk_report_animals(date,date,uuid), public.milk_report_animals_summary(date,date,uuid) from public, anon, authenticated;
revoke all on function public.save_milk_day_waste(date,numeric,text), public.milk_report_date_bounds() from public, anon, authenticated;
grant execute on function public.milk_report_daily(date,date), public.milk_report_customers(date,date), public.milk_report_summary(date,date), public.milk_report_animals(date,date,uuid), public.milk_report_animals_summary(date,date,uuid) to authenticated;
grant execute on function public.save_milk_day_waste(date,numeric,text), public.milk_report_date_bounds() to authenticated;
do $$ begin if (select enabled from private.demo_access where id=1) then
  grant select, insert, update on public.milk_day_adjustments to anon;
  grant execute on function public.milk_report_daily(date,date), public.milk_report_customers(date,date), public.milk_report_summary(date,date), public.milk_report_animals(date,date,uuid), public.milk_report_animals_summary(date,date,uuid), public.save_milk_day_waste(date,numeric,text), public.milk_report_date_bounds() to anon;
end if; end $$;
do $$ begin if (select enabled from private.demo_access where id=1) then
  create policy demo_all on public.milk_day_adjustments for all to anon using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
end if; end $$;
