-- Keep breeding history on a female animal and within her recorded lifetime.
create function public.guard_insemination_subject() returns trigger
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
     or (v_animal.exit_date is not null and new.service_date > v_animal.exit_date) then
    raise exception 'BREEDING_OUTSIDE_LIFETIME';
  end if;
  return new;
end $$;
create trigger guard_insemination_subject before insert or update of animal_id, service_date
on public.inseminations for each row execute function public.guard_insemination_subject();

create function public.guard_calving_subject() returns trigger
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
create trigger guard_calving_subject before insert or update of animal_id, calving_date, insemination_id
on public.calvings for each row execute function public.guard_calving_subject();
