-- Browser preview access is enabled only where private.demo_access is true.
-- Production keeps owner-only access even though the same migration is applied.
do $$
declare t text;
begin
  if not (select enabled from private.demo_access where id = 1) then
    return; -- Production never receives anonymous table or report grants.
  end if;
  foreach t in array array[
    'accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon', t);
    execute format('create policy demo_all on public.%I for all to anon using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()))', t);
  end loop;
  grant select on public.customer_balances, public.animal_status to anon;
  grant execute on function public.customer_month_report(date), public.milk_month_summary(date),
    public.expense_month_report(date), public.pnl_month(date), public.account_entries(uuid),
    public.account_month_summary(date), public.herd_alerts(date), public.rate_on(uuid, date),
    public.farm_today() to anon;
end $$;

-- One milk entry can touch production, animals and customer deliveries. Keep
-- the save atomic so a network error cannot leave a partially updated shift.
create function public.save_milk_entry(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_shift not in ('morning', 'evening') or p_mode not in ('total', 'per_animal')
     or p_total < 0 or p_total > 5000 then
    raise exception 'Invalid milk entry';
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

  delete from public.animal_milk where shift_id = v_id;
  if p_mode = 'per_animal' then
    insert into public.animal_milk (shift_id, animal_id, litres)
    select v_id, (x->>'animal_id')::uuid, (x->>'litres')::numeric
    from jsonb_array_elements(p_animals) x;
  end if;

  delete from public.milk_deliveries where delivery_date = p_date and shift = p_shift;
  insert into public.milk_deliveries (delivery_date, shift, customer_id, litres)
  select p_date, p_shift, (x->>'customer_id')::uuid, (x->>'litres')::numeric
  from jsonb_array_elements(p_deliveries) x
  where (x->>'litres')::numeric > 0;
  return v_id;
end $$;
revoke all on function public.save_milk_entry(date,text,numeric,text,jsonb,jsonb) from public;
grant execute on function public.save_milk_entry(date,text,numeric,text,jsonb,jsonb) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.save_milk_entry(date,text,numeric,text,jsonb,jsonb) to anon;
  end if;
end $$;
