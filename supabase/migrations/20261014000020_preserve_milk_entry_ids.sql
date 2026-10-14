-- Keep delivery, animal-milk and cash-payment IDs stable when an owner edits a shift.
create or replace function public.save_milk_entry(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_shift not in ('morning', 'evening') or p_mode not in ('total', 'per_animal')
     or p_total < 0 or p_total > 5000 then
    raise exception 'Invalid milk entry';
  end if;
  if exists (select 1 from jsonb_array_elements(p_deliveries) x
             where (x->>'litres')::numeric < 0) then
    raise exception 'Delivered milk cannot be negative';
  end if;
  if coalesce((select sum((x->>'litres')::numeric) from jsonb_array_elements(p_deliveries) x), 0) > p_total then
    raise exception 'Delivered milk exceeds produced milk';
  end if;
  if p_mode = 'per_animal' and
     coalesce((select sum((x->>'litres')::numeric) from jsonb_array_elements(p_animals) x), 0) <> p_total then
    raise exception 'Animal milk does not match shift total';
  end if;

  insert into public.milk_shifts (milk_date, shift, total_litres, mode)
  values (p_date, p_shift, p_total, p_mode)
  on conflict (milk_date, shift) do update
    set total_litres = excluded.total_litres, mode = excluded.mode, updated_at = now()
  returning id into v_id;

  if p_mode = 'per_animal' then
    delete from public.animal_milk am where am.shift_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_animals) x
                      where (x->>'animal_id')::uuid = am.animal_id);
    insert into public.animal_milk (shift_id, animal_id, litres)
    select v_id, (x->>'animal_id')::uuid, (x->>'litres')::numeric
    from jsonb_array_elements(p_animals) x
    on conflict (shift_id, animal_id) do update set litres = excluded.litres;
  else
    delete from public.animal_milk where shift_id = v_id;
  end if;

  delete from public.milk_deliveries md where md.delivery_date = p_date and md.shift = p_shift
    and not exists (select 1 from jsonb_array_elements(p_deliveries) x
                    where (x->>'customer_id')::uuid = md.customer_id and (x->>'litres')::numeric > 0);
  insert into public.milk_deliveries (delivery_date, shift, customer_id, litres)
  select p_date, p_shift, (x->>'customer_id')::uuid, (x->>'litres')::numeric
  from jsonb_array_elements(p_deliveries) x
  where (x->>'litres')::numeric > 0
  on conflict (delivery_date, shift, customer_id) do update set litres = excluded.litres;
  return v_id;
end $$;
