-- A linked newborn's biological identity must stay consistent with its birth
-- record. Tag, name, breed, category and later herd status remain editable.
create or replace function public.guard_linked_calf_birth() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.calving_offspring where animal_id = old.id) and
     (new.birth_date is distinct from old.birth_date or
      new.arrival_date is distinct from old.arrival_date or
      new.mother_id is distinct from old.mother_id or
      new.source is distinct from old.source or
      new.species is distinct from old.species or
      new.sex is distinct from old.sex) then
    raise exception 'CALF_BIRTH_IMMUTABLE';
  end if;
  return new;
end $$;

drop trigger guard_linked_calf_birth on public.animals;
create trigger guard_linked_calf_birth
  before update of birth_date, arrival_date, mother_id, source, species, sex on public.animals
  for each row execute function public.guard_linked_calf_birth();
