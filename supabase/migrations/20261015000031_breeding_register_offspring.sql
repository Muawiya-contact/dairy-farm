-- Complete a calving and its newborn records in one transaction. Existing
-- calvings stay readable; their older summary rows are not invented as calves.
alter table public.inseminations add column semen_batch text;
alter table public.inseminations add constraint inseminations_semen_batch_length
  check (semen_batch is null or length(trim(semen_batch)) between 1 and 100);

alter table public.calvings
  add column ease_score smallint check (ease_score between 1 and 5),
  add column request_id uuid unique,
  add column request_hash text;
alter table public.calvings add constraint calvings_request_pair
  check ((request_id is null) = (request_hash is null));

create table public.calving_offspring (
  id uuid primary key default gen_random_uuid(),
  calving_id uuid not null references public.calvings(id) on delete restrict,
  birth_order smallint not null check (birth_order between 1 and 2),
  outcome text not null check (outcome in ('alive', 'stillborn')),
  animal_id uuid unique references public.animals(id) on delete restrict,
  sex text check (sex in ('female', 'male')),
  tag_at_birth text,
  birth_weight_kg numeric(5,2) check (birth_weight_kg is null or birth_weight_kg > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (calving_id, birth_order),
  constraint calving_alive_has_animal check ((outcome = 'alive') = (animal_id is not null))
);

insert into public.calving_offspring (calving_id, birth_order, outcome, animal_id, sex, tag_at_birth)
select c.id, 1, 'alive', c.calf_id, a.sex, a.tag
  from public.calvings c join public.animals a on a.id = c.calf_id
 where c.calf_id is not null;

alter table public.calving_offspring enable row level security;
create policy owner_all on public.calving_offspring for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
revoke all on public.calving_offspring from public, anon;
grant select, insert on public.calving_offspring to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert on public.calving_offspring to anon;
    create policy demo_all on public.calving_offspring for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
  end if;
end $$;

create function public.guard_calving_write() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.request_id is not null and current_setting('app.record_calving', true) is distinct from 'on' then
      raise exception 'CALVING_USE_RPC';
    end if;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.calving_offspring where calving_id = old.id) then
      raise exception 'CALVING_HAS_OFFSPRING';
    end if;
    return old;
  elsif exists (select 1 from public.calving_offspring where calving_id = old.id) and
        current_setting('app.record_calving', true) is distinct from 'on' and
        (new.animal_id is distinct from old.animal_id or
         new.insemination_id is distinct from old.insemination_id or
         new.calving_date is distinct from old.calving_date or
         new.outcome is distinct from old.outcome or
         new.calf_id is distinct from old.calf_id) then
    raise exception 'CALVING_OFFSPRING_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger guard_calving_write before insert or update or delete on public.calvings
for each row execute function public.guard_calving_write();

create function public.guard_calving_offspring_write() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'CALVING_OFFSPRING_IMMUTABLE'; end if;
  if current_setting('app.record_calving', true) is distinct from 'on' then
    raise exception 'CALVING_USE_RPC';
  end if;
  return new;
end $$;
create trigger guard_calving_offspring_write before insert or update or delete on public.calving_offspring
for each row execute function public.guard_calving_offspring_write();

create function public.guard_linked_calf_birth() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.calving_offspring where animal_id = old.id) and
     (new.birth_date is distinct from old.birth_date or
      new.arrival_date is distinct from old.arrival_date or
      new.mother_id is distinct from old.mother_id or
      new.source is distinct from old.source) then
    raise exception 'CALF_BIRTH_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger guard_linked_calf_birth before update of birth_date, arrival_date, mother_id, source on public.animals
for each row execute function public.guard_linked_calf_birth();

create function public.record_calving_with_offspring(
  p_request_id uuid, p_insemination_id uuid, p_calving_date date,
  p_offspring jsonb, p_ease_score smallint default null, p_notes text default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_service public.inseminations%rowtype;
  v_mother public.animals%rowtype;
  v_existing public.calvings%rowtype;
  v_calving_id uuid;
  v_calf_id uuid;
  v_first_calf_id uuid;
  v_child jsonb;
  v_count integer;
  v_order integer := 0;
  v_outcome text;
  v_sex text;
  v_tag text;
  v_weight_text text;
  v_weight numeric;
  v_hash text;
begin
  if p_request_id is null or p_insemination_id is null or p_calving_date is null or
     p_calving_date > public.farm_today() or
     (p_ease_score is not null and p_ease_score not between 1 and 5) or
     jsonb_typeof(p_offspring) is distinct from 'array' then
    raise exception 'CALVING_INVALID';
  end if;
  v_count := jsonb_array_length(p_offspring);
  if v_count not between 1 and 2 then raise exception 'CALVING_INVALID'; end if;
  v_hash := md5(jsonb_build_object('service', p_insemination_id, 'date', p_calving_date,
    'offspring', p_offspring, 'ease', p_ease_score, 'notes', nullif(trim(p_notes), ''))::text);

  select * into v_service from public.inseminations where id = p_insemination_id for update;
  if not found then raise exception 'BREEDING_NOT_OPEN'; end if;
  select * into v_existing from public.calvings where request_id = p_request_id;
  if found then
    if v_existing.insemination_id is distinct from p_insemination_id or
       v_existing.request_hash is distinct from v_hash then
      raise exception 'CALVING_REQUEST_CHANGED';
    end if;
    return v_existing.id;
  end if;
  if v_service.status not in ('pending', 'pregnant') or p_calving_date < v_service.service_date then
    raise exception 'BREEDING_NOT_OPEN';
  end if;
  select * into v_mother from public.animals where id = v_service.animal_id for update;
  if v_mother.life_status is distinct from 'active' or v_mother.sex is distinct from 'female' or
     (v_mother.birth_date is not null and p_calving_date < v_mother.birth_date) or
     (v_mother.arrival_date is not null and p_calving_date < v_mother.arrival_date) then
    raise exception 'CALVING_OUTSIDE_FARM_DATES';
  end if;

  perform set_config('app.record_calving', 'on', true);
  insert into public.calvings (animal_id, insemination_id, calving_date, outcome,
    ease_score, notes, request_id, request_hash)
  values (v_mother.id, p_insemination_id, p_calving_date,
    case when v_count = 2 then 'twins' when p_offspring->0->>'outcome' = 'alive' then 'alive' else 'dead' end,
    p_ease_score, nullif(trim(p_notes), ''), p_request_id, v_hash)
  returning id into v_calving_id;

  for v_child in select value from jsonb_array_elements(p_offspring) loop
    v_order := v_order + 1;
    if jsonb_typeof(v_child) is distinct from 'object' then raise exception 'CALVING_INVALID_CHILD'; end if;
    v_outcome := v_child->>'outcome';
    v_sex := nullif(trim(v_child->>'sex'), '');
    v_tag := nullif(trim(v_child->>'tag'), '');
    v_weight_text := nullif(trim(v_child->>'birth_weight_kg'), '');
    if v_outcome not in ('alive', 'stillborn') or v_outcome is null or
       (v_sex is not null and v_sex not in ('female', 'male')) or
       (v_outcome = 'alive' and v_sex is null) or
       (v_tag is not null and length(v_tag) > 60) or
       (v_weight_text is not null and v_weight_text !~ '^[0-9]+(\.[0-9]{1,2})?$') then
      raise exception 'CALVING_INVALID_CHILD';
    end if;
    v_weight := v_weight_text::numeric;
    if v_weight is not null and (v_weight <= 0 or v_weight > 999.99) then
      raise exception 'CALVING_INVALID_CHILD';
    end if;
    v_calf_id := null;
    if v_outcome = 'alive' then
      v_calf_id := gen_random_uuid();
      v_tag := coalesce(v_tag, 'TEMP-' || substring(replace(v_calf_id::text, '-', ''), 1, 12));
      insert into public.animals (id, tag, name, species, sex, category, birth_date,
        arrival_date, mother_id, sire, source, milking_status)
      values (v_calf_id, v_tag, nullif(trim(v_child->>'name'), ''), v_mother.species,
        v_sex, 'calf', p_calving_date, p_calving_date, v_mother.id,
        nullif(trim(v_service.semen_name), ''), 'born', 'none');
      v_first_calf_id := coalesce(v_first_calf_id, v_calf_id);
    end if;
    insert into public.calving_offspring (calving_id, birth_order, outcome, animal_id,
      sex, tag_at_birth, birth_weight_kg, notes)
    values (v_calving_id, v_order, v_outcome, v_calf_id, v_sex, v_tag, v_weight,
      nullif(trim(v_child->>'notes'), ''));
  end loop;

  update public.calvings set calf_id = v_first_calf_id where id = v_calving_id;
  update public.inseminations set status = 'calved' where id = p_insemination_id;
  return v_calving_id;
end $$;

revoke all on function public.record_calving_with_offspring(uuid,uuid,date,jsonb,smallint,text) from public;
grant execute on function public.record_calving_with_offspring(uuid,uuid,date,jsonb,smallint,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.record_calving_with_offspring(uuid,uuid,date,jsonb,smallint,text) to anon;
  end if;
end $$;
