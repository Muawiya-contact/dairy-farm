-- Milk left from earlier shifts or days is chiller stock. It is inventory,
-- not a sale; only customer deliveries and receipts create income.
-- Replace the obsolete per-shift production caps with the daily stock guard.
drop trigger milk_shift_distribution_check on public.milk_shifts;
drop trigger milk_delivery_distribution_check on public.milk_deliveries;
drop trigger milk_disposition_distribution_check on public.milk_dispositions;
drop function public.trg_milk_distribution_allocation_check();

-- The legacy writer remains available to older clients. Remove only its
-- delivery-vs-current-production check; the deferred daily stock guard still
-- rejects any transaction that spends more milk than the chiller contains.
create or replace function public.save_milk_entry(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_shift not in ('morning','noon','evening') or p_mode not in ('total','per_animal')
     or p_total < 0 or p_total > 5000 then raise exception 'MILK_INVALID'; end if;
  if p_shift = 'noon' and not public.noon_enabled_on(p_date)
    and not exists (select 1 from public.milk_shifts where milk_date = p_date and shift = 'noon') then
    raise exception 'NOON_SHIFT_OFF';
  end if;
  if exists (select 1 from jsonb_array_elements(p_deliveries) x where (x->>'litres')::numeric < 0) then
    raise exception 'MILK_INVALID'; end if;
  if p_mode = 'per_animal' and
     coalesce((select sum((x->>'litres')::numeric) from jsonb_array_elements(p_animals) x),0) <> p_total then
    raise exception 'MILK_INVALID'; end if;
  insert into public.milk_shifts(milk_date,shift,total_litres,mode)
    values(p_date,p_shift,p_total,p_mode)
    on conflict(milk_date,shift) do update set total_litres=excluded.total_litres,
      mode=excluded.mode, updated_at=now() returning id into v_id;
  if p_mode = 'per_animal' then
    delete from public.animal_milk am where am.shift_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_animals) x
        where (x->>'animal_id')::uuid = am.animal_id);
    insert into public.animal_milk(shift_id,animal_id,litres)
      select v_id,(x->>'animal_id')::uuid,(x->>'litres')::numeric from jsonb_array_elements(p_animals) x
      on conflict(shift_id,animal_id) do update set litres=excluded.litres;
  else
    delete from public.animal_milk where shift_id = v_id;
  end if;
  delete from public.milk_deliveries md where md.delivery_date=p_date and md.shift=p_shift
    and not exists (select 1 from jsonb_array_elements(p_deliveries) x
      where (x->>'customer_id')::uuid=md.customer_id and (x->>'litres')::numeric>0);
  insert into public.milk_deliveries(delivery_date,shift,customer_id,litres)
    select p_date,p_shift,(x->>'customer_id')::uuid,(x->>'litres')::numeric
    from jsonb_array_elements(p_deliveries) x where (x->>'litres')::numeric>0
    on conflict(delivery_date,shift,customer_id) do update set litres=excluded.litres;
  return v_id;
end $$;

create or replace function public.save_milk_entry_checked(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb,
  p_expected_updated_at timestamptz, p_notes text
) returns timestamptz language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_shift_id uuid;
  v_updated_at timestamptz;
  v_created uuid;
  v_count integer;
begin
  if p_date is null or p_date > public.farm_today() then
    raise exception 'FUTURE_DATE: doodh ki tareekh aaj se aage nahi ho sakti' using errcode = 'P0001';
  end if;
  if p_shift is null or p_shift not in ('morning', 'noon', 'evening')
     or p_mode is null or p_mode not in ('total', 'per_animal')
     or p_total is null or p_total < 0 or p_total > 5000 or p_total <> round(p_total, 2)
     or jsonb_typeof(p_animals) is distinct from 'array'
     or jsonb_typeof(p_deliveries) is distinct from 'array'
     or length(coalesce(p_notes, '')) > 500 then
    raise exception 'MILK_INVALID: doodh ki entry dobara check karein' using errcode = 'P0001';
  end if;
  if p_mode = 'total' and jsonb_array_length(p_animals) > 0 then
    raise exception 'MILK_INVALID: total mode mein janwar ki miktar nahi likhein' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_animals) a
             where jsonb_typeof(a) <> 'object' or a->>'animal_id' is null or a->>'litres' is null)
     or exists (select 1 from jsonb_array_elements(p_deliveries) d
                where jsonb_typeof(d) <> 'object' or d->>'customer_id' is null or d->>'litres' is null) then
    raise exception 'MILK_INVALID: janwar ya customer ki miktar adhoori hai' using errcode = 'P0001';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_animals) as a(animal_id uuid, litres numeric);
  if v_count <> (select count(distinct a.animal_id) from jsonb_to_recordset(p_animals) as a(animal_id uuid, litres numeric))
     or exists (select 1 from jsonb_to_recordset(p_animals) as a(animal_id uuid, litres numeric)
                where a.litres is null or a.litres < 0 or a.litres > 60 or a.litres <> round(a.litres, 2)) then
    raise exception 'MILK_INVALID: janwar ki miktar 0 se 60 L, 2 decimal tak honi chahiye' using errcode = 'P0001';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_deliveries) as d(customer_id uuid, litres numeric);
  if v_count <> (select count(distinct d.customer_id) from jsonb_to_recordset(p_deliveries) as d(customer_id uuid, litres numeric))
     or exists (select 1 from jsonb_to_recordset(p_deliveries) as d(customer_id uuid, litres numeric)
                where d.litres is null or d.litres <= 0 or d.litres > 3000 or d.litres <> round(d.litres, 2)) then
    raise exception 'MILK_INVALID: customer ki miktar 0 se zyada, 3000 L tak honi chahiye' using errcode = 'P0001';
  end if;
  if p_mode = 'per_animal' and
     (select coalesce(sum(a.litres), 0) from jsonb_to_recordset(p_animals) as a(animal_id uuid, litres numeric)) <> p_total then
    raise exception 'MILK_INVALID: janwaron ka doodh kul miktar se nahi milta' using errcode = 'P0001';
  end if;
  if p_shift = 'noon' and p_expected_updated_at is null and not public.noon_enabled_on(p_date) then
    raise exception 'NOON_SHIFT_OFF' using errcode = 'P0001';
  end if;

  if p_expected_updated_at is null then
    insert into public.milk_shifts (milk_date, shift, total_litres, mode)
    values (p_date, p_shift, p_total, p_mode)
    on conflict (milk_date, shift) do nothing returning id into v_created;
    if v_created is null then raise exception 'MILK_STALE: yeh shift pehle se save ho chuki hai' using errcode = 'P0001'; end if;
  else
    select id, updated_at into v_shift_id, v_updated_at
      from public.milk_shifts where milk_date = p_date and shift = p_shift for update;
    if v_shift_id is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception 'MILK_STALE: yeh shift badal chuki hai' using errcode = 'P0001';
    end if;
  end if;

  v_shift_id := public.save_milk_entry(p_date, p_shift, p_total, p_mode, p_animals, p_deliveries);
  update public.milk_shifts set notes = nullif(trim(p_notes), '') where id = v_shift_id;
  select updated_at into v_updated_at from public.milk_shifts where id = v_shift_id;
  return v_updated_at;
end $$;

create or replace function public.save_milk_entry_with_dispositions(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb, p_dispositions jsonb,
  p_expected_updated_at timestamptz, p_notes text
) returns timestamptz language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_shift_id uuid; v_updated_at timestamptz; v_count integer;
begin
  if jsonb_typeof(p_dispositions) is distinct from 'array' then
    raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_dispositions) d
      where jsonb_typeof(d) <> 'object' or d->>'disposition_type' is null or d->>'category' is null or d->>'litres' is null) then
    raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_dispositions) as d(disposition_type text, category text, litres numeric, recipient text, note text)
  where litres is null or litres <= 0 or litres > 5000 or litres <> round(litres,2)
    or (disposition_type = 'free' and category not in ('employee','friend','guest','charity','other'))
    or (disposition_type = 'internal' and category not in ('owner_home','farm_use'))
    or (disposition_type = 'wastage' and category not in ('spillage','spoiled','other'))
    or disposition_type not in ('free','internal','wastage')
    or (disposition_type = 'wastage' and char_length(trim(coalesce(note,''))) not between 3 and 500)
    or (disposition_type = 'free' and coalesce(char_length(trim(recipient)),0) < 3 and coalesce(char_length(trim(note)),0) < 3)
    or (recipient is not null and char_length(trim(recipient)) > 200)
    or (note is not null and char_length(trim(note)) > 500);
  if v_count > 0 then raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001'; end if;

  -- save_milk_entry_checked validates the customer entries and keeps its
  -- stale-version, month-lock, date, animal and Naqd receipt safeguards. The
  -- daily deferred balance trigger is authoritative for all destinations.
  v_updated_at := public.save_milk_entry_checked(p_date,p_shift,p_total,p_mode,p_animals,p_deliveries,p_expected_updated_at,p_notes);
  select id into v_shift_id from public.milk_shifts where milk_date = p_date and shift = p_shift;
  delete from public.milk_dispositions where shift_id = v_shift_id;
  insert into public.milk_dispositions(milk_date, shift_id, disposition_type, category, litres, recipient, note)
    select p_date, v_shift_id, d.disposition_type, d.category, d.litres,
      nullif(trim(d.recipient),''), nullif(trim(d.note),'')
    from jsonb_to_recordset(p_dispositions) as d(disposition_type text, category text, litres numeric, recipient text, note text);
  select updated_at into v_updated_at from public.milk_shifts where id = v_shift_id;
  return v_updated_at;
end $$;

-- Extend the shift report with each shift's chiller opening and total available
-- stock. The closing balance rolls forward in Subah -> Dopehr -> Shaam order.
drop function public.milk_report_distribution_shifts(date,date);
create function public.milk_report_distribution_shifts(p_from date, p_to date)
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

drop function public.milk_shift_distribution_summary(date);
create function public.milk_shift_distribution_summary(p_date date)
returns table (
  milk_shift text, opening_litres numeric, produced_litres numeric, available_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric, farm_use_litres numeric,
  wasted_litres numeric, allocated_litres numeric, remaining_litres numeric,
  khata_amount numeric, cash_sale_amount numeric, cash_received numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_date is null or p_date > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  return query select r.milk_shift,r.opening_litres,r.produced_litres,r.available_litres,
    r.khata_litres,r.cash_litres,r.free_litres,r.farm_use_litres,r.wasted_litres,
    r.allocated_litres,r.remaining_litres,r.khata_delivery_amount,r.cash_sale_amount,r.cash_received
  from public.milk_report_distribution_shifts(p_date,p_date) r;
end $$;

revoke all on function public.milk_report_distribution_shifts(date,date), public.milk_shift_distribution_summary(date)
  from public, anon, authenticated;
grant execute on function public.milk_report_distribution_shifts(date,date), public.milk_shift_distribution_summary(date)
  to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    grant execute on function public.milk_report_distribution_shifts(date,date), public.milk_shift_distribution_summary(date) to anon;
  end if;
end $$;
