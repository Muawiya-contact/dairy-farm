-- Three daily milk shifts, with a dated rule. Historical two-shift days stay two-shift days.
alter table public.milk_shifts drop constraint milk_shifts_shift_check;
alter table public.milk_shifts add constraint milk_shifts_shift_check check (shift in ('morning','noon','evening'));
alter table public.milk_deliveries drop constraint milk_deliveries_shift_check;
alter table public.milk_deliveries add constraint milk_deliveries_shift_check check (shift in ('morning','noon','evening'));
alter table public.customers add column default_noon numeric(10,2) not null default 0 check (default_noon >= 0);

create table public.milk_shift_config (
  effective_from date primary key,
  noon_enabled boolean not null,
  changed_at timestamptz not null default now()
);
insert into public.milk_shift_config(effective_from, noon_enabled) values (public.farm_today(), true);
alter table public.milk_shift_config enable row level security;
revoke all on public.milk_shift_config from public, anon, authenticated;
grant select on public.milk_shift_config to authenticated;
create policy owner_read on public.milk_shift_config for select to authenticated
  using ((select private.is_app_owner()));
create trigger subscription_write_guard before insert or update or delete on public.milk_shift_config
  for each row execute function private.guard_subscription_write();

create function public.noon_enabled_on(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.noon_enabled from public.milk_shift_config c
    where c.effective_from <= p_date order by c.effective_from desc limit 1), false)
$$;
create function public.expected_shifts(p_date date) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when public.noon_enabled_on(p_date)
    then array['morning','noon','evening']::text[]
    else array['morning','evening']::text[] end
$$;
create function public.milk_shift_history() returns table(effective_from date, noon_enabled boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return query select c.effective_from,c.noon_enabled from public.milk_shift_config c order by c.effective_from;
end $$;
revoke all on function public.noon_enabled_on(date), public.expected_shifts(date) from public, anon, authenticated;
grant execute on function public.noon_enabled_on(date), public.expected_shifts(date) to authenticated;
revoke all on function public.milk_shift_history() from public, anon, authenticated;
grant execute on function public.milk_shift_history() to authenticated;

create function public.set_noon_milk(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'NOON_INVALID'; end if;
  if exists (select 1 from public.month_locks where month = date_trunc('month', public.farm_today())::date) then
    raise exception 'MONTH_LOCKED';
  end if;
  insert into public.milk_shift_config(effective_from, noon_enabled)
    values (public.farm_today(), p_enabled)
    on conflict (effective_from) do update set noon_enabled = excluded.noon_enabled, changed_at = now();
  return p_enabled;
end $$;

-- Remove all historic overloads before creating the one PostgREST-visible signature.
drop function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text);
drop function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text);
drop function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date);

create function public.create_customer(
  p_name text, p_kind text, p_phone text, p_morning numeric,
  p_evening numeric, p_rate numeric, p_opening_balance numeric,
  p_opening_date date, p_free_reason text default null, p_noon numeric default 0
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_kind is null or p_kind not in ('regular','contractor','company','cash','free')
     or nullif(trim(p_name),'') is null or p_morning is null or p_morning < 0
     or p_evening is null or p_evening < 0 or p_noon is null or p_noon < 0
     or p_noon > 5000 or p_noon <> round(p_noon,2)
     or p_opening_balance is null or p_opening_date is null
     or p_opening_date > public.farm_today() then raise exception 'CUSTOMER_INVALID'; end if;
  if p_kind in ('free','cash') and p_opening_balance <> 0 then raise exception 'CUSTOMER_INVALID'; end if;
  if p_kind not in ('free','company') and (p_rate is null or p_rate <= 0) then raise exception 'RATE_MISSING'; end if;
  if p_kind = 'free' and coalesce(p_free_reason,'other') not in ('owner','staff','charity','calves','other') then
    raise exception 'CUSTOMER_FREE_REASON'; end if;
  if p_kind <> 'free' and p_free_reason is not null then raise exception 'CUSTOMER_FREE_REASON'; end if;
  insert into public.customers(name,kind,free_reason,phone,default_morning,default_noon,default_evening,opening_balance,opening_date)
    values(trim(p_name),p_kind,case when p_kind='free' then coalesce(p_free_reason,'other') else null end,nullif(trim(p_phone),''),p_morning,p_noon,p_evening,p_opening_balance,p_opening_date)
    returning id into v_id;
  if p_kind not in ('free','company') then
    insert into public.customer_rates(customer_id,rate,effective_from) values(v_id,p_rate,p_opening_date);
  end if;
  return v_id;
end $$;
revoke all on function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text,numeric) from public, anon, authenticated;
grant execute on function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text,numeric) to authenticated;

create function public.create_customer_once(
  p_request_id uuid, p_name text, p_kind text, p_phone text,
  p_morning numeric, p_evening numeric, p_rate numeric,
  p_opening_balance numeric, p_opening_date date, p_free_reason text,
  p_noon numeric default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request private.customer_create_requests%rowtype; v_id uuid;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'CUSTOMER_REQUEST_REQUIRED'; end if;
  v_payload := jsonb_build_array(trim(p_name),p_kind,nullif(trim(p_phone),''),
    p_morning,p_noon,p_evening,p_rate,p_opening_balance,p_opening_date,p_free_reason);
  insert into private.customer_create_requests(request_id,payload) values(p_request_id,v_payload)
    on conflict(request_id) do nothing;
  select * into v_request from private.customer_create_requests where request_id=p_request_id for update;
  if v_request.payload is distinct from v_payload then raise exception 'CUSTOMER_REQUEST_CHANGED'; end if;
  if v_request.customer_id is not null then return v_request.customer_id; end if;
  v_id := public.create_customer(p_name,p_kind,p_phone,p_morning,p_evening,p_rate,p_opening_balance,p_opening_date,p_free_reason,p_noon);
  update private.customer_create_requests set customer_id=v_id where request_id=p_request_id;
  return v_id;
end $$;
revoke all on function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text,numeric) from public, anon, authenticated;
grant execute on function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text,numeric) to authenticated;
revoke all on function public.set_noon_milk(boolean) from public, anon, authenticated;
grant execute on function public.set_noon_milk(boolean) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    grant execute on function public.set_noon_milk(boolean), public.noon_enabled_on(date), public.expected_shifts(date),
      public.milk_shift_history(),
      public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text,numeric),
      public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text,numeric) to anon;
  end if;
end $$;

-- The six-argument implementation and checked wrapper both enforce the dated rule.
-- Existing noon rows remain editable after a later OFF setting.
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
  if coalesce((select sum((x->>'litres')::numeric) from jsonb_array_elements(p_deliveries) x),0) > p_total then
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

-- Modify only the checked wrapper's shift guard and add the noon creation guard
-- before its insert. The remainder of its validation, stale-write and note logic is unchanged.

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

  if p_shift = 'noon' and p_expected_updated_at is null and not public.noon_enabled_on(p_date) then
    raise exception 'NOON_SHIFT_OFF' using errcode = 'P0001';
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
