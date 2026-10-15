-- Keep an animal's time on this farm separate from its age. Existing dates are
-- copied where known; a missing historical arrival is left unknown.
alter table public.animals
  add column arrival_date date,
  add column estimated_age_months_at_arrival integer;

update public.animals
   set arrival_date = case when source = 'born' then birth_date else purchase_date end
 where arrival_date is null;

alter table public.animals drop constraint animals_source_check;
alter table public.animals add constraint animals_source_check
  check (source in ('born', 'purchased', 'gift', 'transfer', 'other'));
alter table public.animals drop constraint animals_life_status_check;
alter table public.animals add constraint animals_life_status_check
  check (life_status in ('active', 'sold', 'dead', 'removed'));
alter table public.animals add constraint animals_estimated_age_range
  check (estimated_age_months_at_arrival is null or estimated_age_months_at_arrival between 0 and 600);
alter table public.animals add constraint animals_age_evidence_exclusive
  check (birth_date is null or estimated_age_months_at_arrival is null);
alter table public.animals add constraint animals_arrival_after_birth
  check (arrival_date is null or birth_date is null or arrival_date >= birth_date);
alter table public.animals add constraint animals_arrival_before_exit
  check (arrival_date is null or exit_date is null or arrival_date <= exit_date);

create function public.guard_animal_lifecycle_dates() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' and new.arrival_date is null then
    raise exception 'ANIMAL_ARRIVAL_REQUIRED';
  end if;
  if (new.birth_date is not null and new.birth_date > public.farm_today())
     or (new.arrival_date is not null and new.arrival_date > public.farm_today())
     or (new.purchase_date is not null and new.purchase_date > public.farm_today()) then
    raise exception 'ANIMAL_FUTURE_DATE';
  end if;
  if new.source = 'born' and
     (new.birth_date is null or new.arrival_date is distinct from new.birth_date) then
    if tg_op = 'INSERT' then
      raise exception 'ANIMAL_BIRTH_ARRIVAL';
    elsif old.source is distinct from new.source or old.birth_date is distinct from new.birth_date or
          old.arrival_date is distinct from new.arrival_date then
      raise exception 'ANIMAL_BIRTH_ARRIVAL';
    end if;
  end if;
  if new.estimated_age_months_at_arrival is not null and new.arrival_date is null then
    raise exception 'ANIMAL_ESTIMATE_NEEDS_ARRIVAL';
  end if;
  return new;
end $$;

create trigger guard_animal_lifecycle_dates
before insert or update of source, birth_date, arrival_date, purchase_date,
  estimated_age_months_at_arrival on public.animals
for each row execute function public.guard_animal_lifecycle_dates();

create or replace function public.guard_animal_history_edits() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.sex = 'male' and old.sex is distinct from new.sex and
     (exists (select 1 from public.animal_milk where animal_id = new.id)
      or exists (select 1 from public.inseminations where animal_id = new.id)
      or exists (select 1 from public.calvings where animal_id = new.id)) then
    raise exception 'ANIMAL_HISTORY_SEX';
  end if;

  if new.birth_date is not null and old.birth_date is distinct from new.birth_date and
     ((new.purchase_date is not null and new.purchase_date < new.birth_date)
      or exists (select 1 from public.animal_milk am join public.milk_shifts ms on ms.id = am.shift_id
                 where am.animal_id = new.id and ms.milk_date < new.birth_date)
      or exists (select 1 from public.health_events h where h.animal_id = new.id and h.event_date < new.birth_date)
      or exists (select 1 from public.inseminations i where i.animal_id = new.id and i.service_date < new.birth_date)
      or exists (select 1 from public.calvings c where c.animal_id = new.id and c.calving_date < new.birth_date)) then
    raise exception 'ANIMAL_BIRTH_AFTER_ACTIVITY';
  end if;

  if new.arrival_date is not null and old.arrival_date is distinct from new.arrival_date and
     (exists (select 1 from public.animal_milk am join public.milk_shifts ms on ms.id = am.shift_id
              where am.animal_id = new.id and ms.milk_date < new.arrival_date)
      or exists (select 1 from public.health_events h where h.animal_id = new.id and h.event_date < new.arrival_date)
      or exists (select 1 from public.inseminations i where i.animal_id = new.id and i.service_date < new.arrival_date)
      or exists (select 1 from public.calvings c where c.animal_id = new.id and c.calving_date < new.arrival_date)) then
    raise exception 'ANIMAL_ARRIVAL_AFTER_ACTIVITY';
  end if;
  return new;
end $$;

drop trigger guard_animal_history_edits on public.animals;
create trigger guard_animal_history_edits
before update of sex, birth_date, arrival_date on public.animals
for each row execute function public.guard_animal_history_edits();

create or replace function public.guard_animal_exit_activity() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.life_status <> 'active' and
     (old.life_status = 'active' or new.exit_date is distinct from old.exit_date) then
    if (new.arrival_date is not null and new.arrival_date > new.exit_date)
       or (new.purchase_date is not null and new.purchase_date > new.exit_date)
       or exists (select 1 from public.animal_milk am join public.milk_shifts ms on ms.id = am.shift_id
                  where am.animal_id = new.id and ms.milk_date > new.exit_date)
       or exists (select 1 from public.health_events h where h.animal_id = new.id and h.event_date > new.exit_date)
       or exists (select 1 from public.inseminations i where i.animal_id = new.id and i.service_date > new.exit_date)
       or exists (select 1 from public.calvings c where c.animal_id = new.id and c.calving_date > new.exit_date) then
      raise exception 'EXIT_BEFORE_ACTIVITY';
    end if;
  end if;
  return new;
end $$;

-- Historical activity remains editable, but its date must stay within the
-- animal's recorded time on this farm. An unknown legacy arrival stays open.
create or replace function public.trg_animal_milk_check() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_animal public.animals%rowtype; v_date date;
begin
  select * into v_animal from public.animals where id = new.animal_id;
  select milk_date into v_date from public.milk_shifts where id = new.shift_id;
  if v_animal.sex <> 'female' or
     (v_animal.life_status <> 'active' and v_animal.exit_date <= v_date) then
    raise exception 'ANIMAL_NOT_MILKING';
  end if;
  if (v_animal.arrival_date is not null and v_date < v_animal.arrival_date)
     or (v_animal.birth_date is not null and v_date < v_animal.birth_date) then
    raise exception 'ANIMAL_BEFORE_ARRIVAL';
  end if;
  return new;
end $$;

create or replace function public.guard_insemination_subject() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_animal public.animals%rowtype;
begin
  select * into v_animal from public.animals where id = new.animal_id;
  if v_animal.sex is distinct from 'female' then
    raise exception 'BREEDING_REQUIRES_FEMALE';
  end if;
  if new.service_date > public.farm_today() then
    raise exception 'BREEDING_FUTURE_DATE';
  end if;
  if (v_animal.birth_date is not null and new.service_date < v_animal.birth_date)
     or (v_animal.arrival_date is not null and new.service_date < v_animal.arrival_date)
     or (v_animal.exit_date is not null and new.service_date > v_animal.exit_date) then
    raise exception 'BREEDING_OUTSIDE_LIFETIME';
  end if;
  return new;
end $$;

create or replace function public.guard_calving_subject() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_animal public.animals%rowtype;
begin
  select * into v_animal from public.animals where id = new.animal_id;
  if v_animal.sex is distinct from 'female' then
    raise exception 'BREEDING_REQUIRES_FEMALE';
  end if;
  if new.calving_date > public.farm_today() then
    raise exception 'CALVING_FUTURE_DATE';
  end if;
  if (v_animal.birth_date is not null and new.calving_date < v_animal.birth_date)
     or (v_animal.arrival_date is not null and new.calving_date < v_animal.arrival_date)
     or (v_animal.exit_date is not null and new.calving_date > v_animal.exit_date) then
    raise exception 'BREEDING_OUTSIDE_LIFETIME';
  end if;
  if new.insemination_id is not null and not exists (
    select 1 from public.inseminations i where i.id = new.insemination_id
      and i.animal_id = new.animal_id and i.service_date <= new.calving_date
  ) then
    raise exception 'CALVING_INSEMINATION_MISMATCH';
  end if;
  return new;
end $$;

create function public.guard_health_animal_date() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_animal public.animals%rowtype;
begin
  select * into v_animal from public.animals where id = new.animal_id;
  if (v_animal.birth_date is not null and new.event_date < v_animal.birth_date)
     or (v_animal.arrival_date is not null and new.event_date < v_animal.arrival_date)
     or (v_animal.exit_date is not null and new.event_date > v_animal.exit_date) then
    raise exception 'ANIMAL_OUTSIDE_FARM_DATES';
  end if;
  return new;
end $$;
create trigger guard_health_animal_date before insert or update of animal_id, event_date
on public.health_events for each row execute function public.guard_health_animal_date();

create or replace function public.close_animal(
  p_animal_id uuid, p_status text, p_exit_date date, p_reason text,
  p_sale_price numeric, p_account_id uuid
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_animal_id is null or p_status not in ('sold', 'dead', 'removed')
     or p_exit_date is null or p_exit_date > public.farm_today()
     or (p_status = 'sold' and (p_sale_price is null or p_sale_price <= 0 or p_account_id is null))
     or (p_status <> 'sold' and (p_sale_price is not null or p_account_id is not null))
     or (p_status = 'removed' and nullif(trim(p_reason), '') is null) then
    raise exception 'Invalid animal exit';
  end if;

  update public.animals
     set life_status = p_status, exit_date = p_exit_date,
         exit_reason = nullif(trim(p_reason), ''), sale_price = p_sale_price,
         milking_status = 'none'
   where id = p_animal_id and life_status = 'active'
     and (birth_date is null or birth_date <= p_exit_date)
     and (arrival_date is null or arrival_date <= p_exit_date);
  if not found then
    raise exception 'Active animal not found or exit date precedes arrival/birth';
  end if;

  if p_status = 'sold' then
    insert into public.other_income (income_date, kind, amount, account_id, animal_id, note)
    values (p_exit_date, 'animal_sale', p_sale_price, p_account_id, p_animal_id, nullif(trim(p_reason), ''));
  end if;
  return p_animal_id;
end $$;
