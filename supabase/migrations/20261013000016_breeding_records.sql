-- Track edits to breeding records and save calving + breeding status together.
alter table public.inseminations add column updated_at timestamptz not null default now();
create trigger inseminations_touch before update on public.inseminations
  for each row execute function public.trg_touch();

create or replace function public.record_calving(
  p_insemination_id uuid, p_calving_date date, p_outcome text, p_notes text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_record public.inseminations%rowtype;
  v_id uuid;
begin
  select * into v_record from public.inseminations
    where id = p_insemination_id for update;
  if not found or v_record.status not in ('pending', 'pregnant') then
    raise exception 'BREEDING_NOT_OPEN';
  end if;
  if p_calving_date is null or p_calving_date < v_record.service_date then
    raise exception 'CALVING_BEFORE_SERVICE';
  end if;
  if p_outcome not in ('alive', 'dead', 'twins') then
    raise exception 'INVALID_CALVING_OUTCOME';
  end if;
  if not exists (select 1 from public.animals where id = v_record.animal_id and life_status = 'active') then
    raise exception 'ANIMAL_NOT_ACTIVE';
  end if;

  insert into public.calvings (animal_id, insemination_id, calving_date, outcome, notes)
  values (v_record.animal_id, p_insemination_id, p_calving_date, p_outcome, nullif(trim(p_notes), ''))
  returning id into v_id;
  update public.inseminations set status = 'calved' where id = p_insemination_id;
  return v_id;
end $$;
revoke all on function public.record_calving(uuid, date, text, text) from public;
grant execute on function public.record_calving(uuid, date, text, text) to anon, authenticated;
