-- Corrections to an animal record must not contradict its recorded history.
create function public.guard_animal_history_edits() returns trigger
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
      or exists (select 1 from public.animal_milk am
                 join public.milk_shifts ms on ms.id = am.shift_id
                 where am.animal_id = new.id and ms.milk_date < new.birth_date)
      or exists (select 1 from public.health_events h
                 where h.animal_id = new.id and h.event_date < new.birth_date)
      or exists (select 1 from public.inseminations i
                 where i.animal_id = new.id and i.service_date < new.birth_date)
      or exists (select 1 from public.calvings c
                 where c.animal_id = new.id and c.calving_date < new.birth_date)) then
    raise exception 'ANIMAL_BIRTH_AFTER_ACTIVITY';
  end if;
  return new;
end $$;

create trigger guard_animal_history_edits
before update of sex, birth_date on public.animals
for each row execute function public.guard_animal_history_edits();
