-- An exit cannot be dated before activity already recorded for the animal.
create function public.guard_animal_exit_activity() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.life_status <> 'active' and
     (old.life_status = 'active' or new.exit_date is distinct from old.exit_date) then
    if (new.purchase_date is not null and new.purchase_date > new.exit_date)
       or exists (select 1 from public.animal_milk am
                  join public.milk_shifts ms on ms.id = am.shift_id
                  where am.animal_id = new.id and ms.milk_date > new.exit_date)
       or exists (select 1 from public.health_events h
                  where h.animal_id = new.id and h.event_date > new.exit_date)
       or exists (select 1 from public.inseminations i
                  where i.animal_id = new.id and i.service_date > new.exit_date)
       or exists (select 1 from public.calvings c
                  where c.animal_id = new.id and c.calving_date > new.exit_date) then
      raise exception 'EXIT_BEFORE_ACTIVITY';
    end if;
  end if;
  return new;
end $$;

create trigger guard_animal_exit_activity
before update of life_status, exit_date on public.animals
for each row execute function public.guard_animal_exit_activity();
