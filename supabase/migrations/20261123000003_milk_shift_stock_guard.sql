-- Validate the chiller balance at every shift boundary. A later shift's
-- production must not hide an earlier shift that spent milk before it existed.
create or replace function public.trg_milk_distribution_daily_balance_check()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_from date;
  v_negative_date date;
  v_negative_shift text;
begin
  if tg_table_name = 'milk_shifts' then
    if tg_op = 'INSERT' then v_from := new.milk_date;
    elsif tg_op = 'DELETE' then v_from := old.milk_date;
    else v_from := least(old.milk_date, new.milk_date);
    end if;
  elsif tg_table_name = 'milk_deliveries' then
    if tg_op = 'INSERT' then v_from := new.delivery_date;
    elsif tg_op = 'DELETE' then v_from := old.delivery_date;
    else v_from := least(old.delivery_date, new.delivery_date);
    end if;
  else
    if tg_op = 'INSERT' then v_from := new.milk_date;
    elsif tg_op = 'DELETE' then v_from := old.milk_date;
    else v_from := least(old.milk_date, new.milk_date);
    end if;
  end if;

  -- Serialize commit-time checks so concurrent entries cannot both spend the
  -- same chiller litres based on snapshots that omit the other transaction.
  perform pg_advisory_xact_lock(59429, 1);

  with prior_balance as (
    select coalesce(sum(movement_litres), 0) as litres
    from (
      select total_litres as movement_litres from public.milk_shifts where milk_date < v_from
      union all select -litres from public.milk_deliveries where delivery_date < v_from
      union all select -litres from public.milk_dispositions where milk_date < v_from
    ) prior
  ), ordered_movements as (
    select movement_date, shift_order, sum(movement_litres) as litres
    from (
      select s.milk_date as movement_date,
        case s.shift when 'morning' then 1 when 'noon' then 2 else 3 end as shift_order,
        s.total_litres as movement_litres
      from public.milk_shifts s where s.milk_date >= v_from
      union all
      select d.delivery_date,
        case d.shift when 'morning' then 1 when 'noon' then 2 else 3 end,
        -d.litres
      from public.milk_deliveries d where d.delivery_date >= v_from
      union all
      select d.milk_date,
        case s.shift when 'morning' then 1 when 'noon' then 2 else 3 end,
        -d.litres
      from public.milk_dispositions d
      join public.milk_shifts s on s.id = d.shift_id
      where d.milk_date >= v_from
      union all
      -- Day-level unassigned waste has no shift timestamp; it is recorded
      -- after that day's Subah, Dopehr and Shaam allocations.
      select d.milk_date, 4, -d.litres
      from public.milk_dispositions d
      where d.milk_date >= v_from and d.shift_id is null
    ) movements
    group by movement_date, shift_order
  ), balances as (
    select movement_date, shift_order,
      prior_balance.litres + sum(ordered_movements.litres) over (
        order by movement_date, shift_order rows between unbounded preceding and current row
      ) as litres
    from ordered_movements cross join prior_balance
  )
  select movement_date, case shift_order when 1 then 'morning' when 2 then 'noon' when 3 then 'evening' else 'day-end waste' end
    into v_negative_date, v_negative_shift
  from balances
  where litres < 0
  order by movement_date, shift_order
  limit 1;

  if v_negative_date is not null then
    raise exception 'MILK_DISTRIBUTION_EXCEEDS_AVAILABLE'
      using errcode = 'P0001', detail = v_negative_date::text || ' ' || v_negative_shift;
  end if;
  return null;
end $$;

-- The legacy waste form records one unassigned day-level row. Show that row
-- against the day's last saved shift so shift totals reconcile with closing
-- chiller stock and the daily report.
create or replace function public.milk_report_distribution_shifts(p_from date, p_to date)
returns table (
  report_date date, milk_shift text, opening_litres numeric, produced_litres numeric, available_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric,
  farm_use_litres numeric, wasted_litres numeric, allocated_litres numeric, remaining_litres numeric,
  khata_delivery_amount numeric, cash_sale_amount numeric, cash_received numeric, galla_cash_received numeric,
  free_details jsonb, farm_use_details jsonb, waste_details jsonb
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with dates as (
    select distinct s.milk_date from public.milk_shifts s where s.milk_date between p_from and p_to
  ), daily_opening as (
    select d.milk_date,
      coalesce((select sum(s.total_litres) from public.milk_shifts s where s.milk_date < d.milk_date),0)
      - coalesce((select sum(x.litres) from public.milk_deliveries x where x.delivery_date < d.milk_date),0)
      - coalesce((select sum(x.litres) from public.milk_dispositions x where x.milk_date < d.milk_date),0) opening_litres
    from dates d
  ), last_shift as (
    select distinct on (s.milk_date) s.milk_date, s.id, s.shift
    from public.milk_shifts s where s.milk_date between p_from and p_to
    order by s.milk_date, case s.shift when 'morning' then 1 when 'noon' then 2 else 3 end desc
  ), deliveries as (
    select x.delivery_date,x.shift,
      coalesce(sum(x.litres) filter (where c.kind in ('regular','contractor','company')),0) khata_litres,
      coalesce(sum(x.litres) filter (where c.kind='cash'),0) cash_litres,
      coalesce(sum(x.litres) filter (where c.kind='free'),0) free_litres,
      coalesce(sum(x.litres),0) total_litres,
      coalesce(sum(x.amount) filter (where c.kind <> 'cash'),0) khata_amount,
      coalesce(sum(x.amount) filter (where c.kind='cash'),0) cash_sale_amount
    from public.milk_deliveries x join public.customers c on c.id=x.customer_id
    where x.delivery_date between p_from and p_to group by x.delivery_date,x.shift
  ), disposition_groups as (
    select d.shift_id,
      coalesce(sum(d.litres) filter (where d.disposition_type='free'),0) free_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(d.litres) filter (where d.disposition_type='wastage'),0) wasted_litres,
      coalesce(sum(d.litres),0) total_litres
    from public.milk_dispositions d join public.milk_shifts s on s.id=d.shift_id
    where s.milk_date between p_from and p_to group by d.shift_id
    union all
    select s.id, 0::numeric, 0::numeric, sum(d.litres), sum(d.litres)
    from public.milk_dispositions d join last_shift s on s.milk_date=d.milk_date
    where d.shift_id is null and d.disposition_type='wastage'
    group by s.id
  ), dispositions as (
    select dg.shift_id, sum(dg.free_litres) free_litres, sum(dg.farm_use_litres) farm_use_litres,
      sum(dg.wasted_litres) wasted_litres, sum(dg.total_litres) total_litres
    from disposition_groups dg group by dg.shift_id
  ), payments as (
    select d.delivery_date,d.shift,
      coalesce(sum(p.amount) filter (where p.kind='payment' and p.payment_date=d.delivery_date),0) cash_received,
      coalesce(sum(p.amount) filter (where p.kind='payment' and p.payment_date=d.delivery_date and a.is_farm_cash),0) galla_cash_received
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id and c.kind='cash'
    left join public.payments p on p.delivery_id=d.id left join public.accounts a on a.id=p.account_id
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
    union all
    select d.milk_date,s.shift,'wastage'::text,
      jsonb_build_object('category',d.category,'recipient',null,'note',d.note,'litres',d.litres)
    from public.milk_dispositions d join last_shift s on s.milk_date=d.milk_date
    where d.shift_id is null and d.disposition_type='wastage'
  ), details as (
    select x.report_date,x.shift,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='free'),'[]'::jsonb) free_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='internal'),'[]'::jsonb) farm_use_details,
      coalesce(jsonb_agg(x.detail order by x.detail->>'recipient',x.detail->>'category') filter (where x.detail_type='wastage'),'[]'::jsonb) waste_details
    from detail_rows x group by x.report_date,x.shift
  ), shift_rows as (
    select s.id,s.milk_date,s.shift,s.total_litres produced_litres,
      coalesce(d.khata_litres,0) khata_litres,coalesce(d.cash_litres,0) cash_litres,
      coalesce(d.free_litres,0)+coalesce(m.free_litres,0) free_litres,
      coalesce(m.farm_use_litres,0) farm_use_litres,coalesce(m.wasted_litres,0) wasted_litres,
      coalesce(d.total_litres,0)+coalesce(m.total_litres,0) allocated_litres,
      coalesce(d.khata_amount,0) khata_delivery_amount,coalesce(d.cash_sale_amount,0) cash_sale_amount,
      coalesce(p.cash_received,0) cash_received,coalesce(p.galla_cash_received,0) galla_cash_received,
      coalesce(t.free_details,'[]'::jsonb) free_details,coalesce(t.farm_use_details,'[]'::jsonb) farm_use_details,
      coalesce(t.waste_details,'[]'::jsonb) waste_details,o.opening_litres
    from public.milk_shifts s join daily_opening o on o.milk_date=s.milk_date
    left join deliveries d on d.delivery_date=s.milk_date and d.shift=s.shift
    left join dispositions m on m.shift_id=s.id
    left join payments p on p.delivery_date=s.milk_date and p.shift=s.shift
    left join details t on t.report_date=s.milk_date and t.shift=s.shift
    where s.milk_date between p_from and p_to
  ), running as (
    select r.*,
      r.opening_litres + coalesce(sum(r.produced_litres-r.allocated_litres) over (
        partition by r.milk_date order by case r.shift when 'morning' then 1 when 'noon' then 2 else 3 end
        rows between unbounded preceding and 1 preceding
      ),0) shift_opening_litres
    from shift_rows r
  )
  select r.milk_date,r.shift,r.shift_opening_litres,r.produced_litres,
    r.shift_opening_litres+r.produced_litres,
    r.khata_litres,r.cash_litres,r.free_litres,r.farm_use_litres,r.wasted_litres,r.allocated_litres,
    r.shift_opening_litres+r.produced_litres-r.allocated_litres,
    r.khata_delivery_amount,r.cash_sale_amount,r.cash_received,r.galla_cash_received,
    r.free_details,r.farm_use_details,r.waste_details
  from running r
  order by r.milk_date,case r.shift when 'morning' then 1 when 'noon' then 2 else 3 end;
end $$;

revoke all on function public.trg_milk_distribution_daily_balance_check() from public, anon, authenticated;
