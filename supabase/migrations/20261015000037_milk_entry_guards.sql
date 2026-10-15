-- A checked, atomic entry point for daily milk. The six-argument function stays
-- available to an already-open browser tab during deployment.
create function public.trg_milk_not_future() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if (to_jsonb(new) ->> tg_argv[0])::date > public.farm_today() then
    raise exception 'FUTURE_DATE: doodh ki tareekh aaj se aage nahi ho sakti' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger milk_shift_not_future before insert or update on public.milk_shifts
  for each row execute function public.trg_milk_not_future('milk_date');
create trigger milk_delivery_not_future before insert or update on public.milk_deliveries
  for each row execute function public.trg_milk_not_future('delivery_date');

-- Deliveries have no foreign key to milk_shifts, but their edits still change
-- the complete shift snapshot used by the optimistic save check.
create function public.trg_milk_delivery_touch_shift() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    update public.milk_shifts set updated_at = clock_timestamp()
    where milk_date = old.delivery_date and shift = old.shift;
  end if;
  if tg_op <> 'DELETE' then
    update public.milk_shifts set updated_at = clock_timestamp()
    where milk_date = new.delivery_date and shift = new.shift;
  end if;
  return null;
end $$;
create trigger milk_delivery_touch_shift after insert or update or delete on public.milk_deliveries
  for each row execute function public.trg_milk_delivery_touch_shift();

create function public.save_milk_entry_checked(
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
  if p_shift is null or p_shift not in ('morning', 'evening')
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
             where jsonb_typeof(a) <> 'object' or a->>'animal_id' is null
               or a->>'litres' is null)
     or exists (select 1 from jsonb_array_elements(p_deliveries) d
                where jsonb_typeof(d) <> 'object' or d->>'customer_id' is null
                  or d->>'litres' is null) then
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
  if (select coalesce(sum(d.litres), 0) from jsonb_to_recordset(p_deliveries) as d(customer_id uuid, litres numeric)) > p_total then
    raise exception 'MILK_INVALID: diya gaya doodh kul miktar se zyada hai' using errcode = 'P0001';
  end if;

  -- A first insert also serializes two simultaneous creators of the same shift.
  if p_expected_updated_at is null then
    insert into public.milk_shifts (milk_date, shift, total_litres, mode)
    values (p_date, p_shift, p_total, p_mode)
    on conflict (milk_date, shift) do nothing returning id into v_created;
    if v_created is null then
      raise exception 'MILK_STALE: yeh shift pehle se save ho chuki hai' using errcode = 'P0001';
    end if;
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

revoke all on function public.save_milk_entry_checked(date, text, numeric, text, jsonb, jsonb, timestamptz, text) from public;
grant execute on function public.save_milk_entry_checked(date, text, numeric, text, jsonb, jsonb, timestamptz, text) to authenticated;
-- Staging's demo access uses the same flag as the existing milk RPC.
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.save_milk_entry_checked(date, text, numeric, text, jsonb, jsonb, timestamptz, text) to anon;
  end if;
end $$;
