create table public.animal_weight_records (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete restrict,
  weight_date date not null,
  weight_kg numeric(7,2) not null check (weight_kg > 0 and weight_kg <= 9999.99),
  notes text check (notes is null or length(trim(notes)) <= 500),
  created_at timestamptz not null default now()
);

create index animal_weight_records_history_idx
  on public.animal_weight_records(animal_id, weight_date, created_at, id);

create function public.guard_animal_weight_record() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_animal public.animals%rowtype;
  v_first_recorded_day date;
begin
  if tg_op <> 'INSERT' then
    raise exception 'ANIMAL_WEIGHT_HISTORY_APPEND_ONLY';
  end if;

  select * into v_animal from public.animals where id = new.animal_id;
  if not found then raise exception 'ANIMAL_WEIGHT_ANIMAL_NOT_FOUND'; end if;
  if new.weight_date > public.farm_today() then raise exception 'ANIMAL_WEIGHT_DATE_IN_FUTURE'; end if;

  v_first_recorded_day := coalesce(v_animal.arrival_date, v_animal.birth_date);
  if v_first_recorded_day is not null and new.weight_date < v_first_recorded_day then
    raise exception 'ANIMAL_WEIGHT_BEFORE_FARM_ARRIVAL';
  end if;
  if v_animal.exit_date is not null and new.weight_date > v_animal.exit_date then
    raise exception 'ANIMAL_WEIGHT_AFTER_FARM_EXIT';
  end if;
  return new;
end $$;

create trigger animal_weight_record_guard
before insert or update or delete on public.animal_weight_records
for each row execute function public.guard_animal_weight_record();
create trigger subscription_write_guard
before insert or update or delete on public.animal_weight_records
for each row execute function private.guard_subscription_write();
create trigger animal_weight_records_month_lock
before insert or update or delete on public.animal_weight_records
for each row execute function public.trg_month_lock('weight_date');

alter table public.animal_weight_records enable row level security;
create policy animal_weight_owner_read on public.animal_weight_records for select to authenticated
  using ((select private.is_app_owner()));
create policy animal_weight_owner_insert on public.animal_weight_records for insert to authenticated
  with check ((select private.is_app_owner()));
revoke all on public.animal_weight_records from public, anon;
grant select, insert on public.animal_weight_records to authenticated;

revoke all on function public.guard_animal_weight_record() from public, anon, authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert on public.animal_weight_records to anon;
    create policy animal_weight_demo_access on public.animal_weight_records for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
  end if;
end $$;
