alter table public.inseminations
  add column ultrasound_due_override date,
  add column checkup_due_override date,
  add column dry_off_due_override date,
  add column calving_due_override date,
  add constraint insem_ultrasound_override_after_service
    check (ultrasound_due_override is null or ultrasound_due_override >= service_date),
  add constraint insem_checkup_override_after_service
    check (checkup_due_override is null or checkup_due_override >= service_date),
  add constraint insem_dry_off_override_after_service
    check (dry_off_due_override is null or dry_off_due_override >= service_date),
  add constraint insem_calving_override_after_service
    check (calving_due_override is null or calving_due_override >= service_date);

create or replace function public.trg_insem_due_dates() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare s public.settings; v_gap integer;
begin
  if tg_op = 'INSERT' then
    select * into s from public.settings where id = 1;
    new.ultrasound_due := new.service_date + s.ultrasound_days;
    new.dry_off_due := new.service_date + s.dry_off_days;
    new.calving_due := new.service_date + s.calving_days;
    new.checkup_due := coalesce(new.ultrasound_date, new.ultrasound_due_override, new.ultrasound_due) + s.checkup_days;
  else
    v_gap := old.checkup_due - coalesce(old.ultrasound_date, old.ultrasound_due_override, old.ultrasound_due);
    if new.service_date is distinct from old.service_date then
      new.ultrasound_due := old.ultrasound_due + (new.service_date - old.service_date);
      new.dry_off_due := old.dry_off_due + (new.service_date - old.service_date);
      new.calving_due := old.calving_due + (new.service_date - old.service_date);
    else
      new.ultrasound_due := old.ultrasound_due;
      new.dry_off_due := old.dry_off_due;
      new.calving_due := old.calving_due;
    end if;
    new.checkup_due := coalesce(new.ultrasound_date, new.ultrasound_due_override, new.ultrasound_due) + v_gap;
  end if;
  return new;
end $$;

create table public.animal_care_tasks (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete restrict,
  category text not null check (category in ('heat','vaccination','deworming','medicine','checkup','custom')),
  title text not null check (length(trim(title)) between 1 and 120),
  due_date date not null,
  notes text check (notes is null or length(notes) <= 500),
  completed_date date,
  completion_notes text check (completion_notes is null or length(completion_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint animal_care_completion_note_needs_date
    check (completed_date is not null or completion_notes is null)
);

create index animal_care_tasks_active_due_idx on public.animal_care_tasks(due_date, animal_id)
  where completed_date is null;
create trigger animal_care_tasks_touch before update on public.animal_care_tasks
  for each row execute function public.trg_touch();

create function public.guard_animal_care_task() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.completed_date is not null and new.completed_date > public.farm_today() then
    raise exception 'CARE_TASK_COMPLETION_IN_FUTURE';
  end if;
  return new;
end $$;
create trigger animal_care_tasks_guard before insert or update on public.animal_care_tasks
  for each row execute function public.guard_animal_care_task();
create trigger subscription_write_guard before insert or update or delete on public.animal_care_tasks
  for each row execute function private.guard_subscription_write();

alter table public.animal_care_tasks enable row level security;
create policy owner_all on public.animal_care_tasks for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
revoke all on public.animal_care_tasks from public, anon;
grant select, insert, update, delete on public.animal_care_tasks to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert, update, delete on public.animal_care_tasks to anon;
    create policy demo_all on public.animal_care_tasks for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
  end if;
end $$;

create function public.animal_breeding_alerts(p_today date)
returns table(alert_kind text, severity text, due_date date, animal_id uuid,
  tag text, message text, days_left integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  with due as (
    select 'ultrasound'::text kind, coalesce(i.ultrasound_due_override, i.ultrasound_due) due,
      a.id animal, a.tag, 'ultrasound'::text action, s.reminder_days window_days
    from public.inseminations i join public.animals a on a.id=i.animal_id cross join public.settings s
    where a.life_status='active' and i.status='pending' and i.ultrasound_date is null
    union all
    select 'checkup', coalesce(i.checkup_due_override, i.checkup_due), a.id, a.tag, 'checkup', s.reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id cross join public.settings s
    where a.life_status='active' and i.status='pregnant' and i.checkup_date is null
    union all
    select 'dry_off', coalesce(i.dry_off_due_override, i.dry_off_due), a.id, a.tag, 'khushk karna', s.reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id cross join public.settings s
    where a.life_status='active' and i.status='pregnant'
      and a.milking_status='milking' and i.dry_off_date is null
    union all
    select 'calving', coalesce(i.calving_due_override, i.calving_due), a.id, a.tag, 'bachay ki paidaish', s.calving_reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id cross join public.settings s
    where a.life_status='active' and i.status='pregnant'
  ), visible as (
    select *, due - p_today left_days from due where due <= p_today + window_days
  )
  select kind,
    case when left_days < 0 then 'overdue' when left_days = 0 then 'today'
      when left_days <= 3 then 'soon' else 'upcoming' end,
    due, animal, tag,
    tag || ': ' || action || ' — ' || case when left_days < 0 then (-left_days)::text || ' din late'
      when left_days = 0 then 'Aaj' when left_days = 1 then 'Kal' else left_days::text || ' din baad' end ||
      ' (' || to_char(due, 'FMDD Mon') || ')', left_days
  from visible
  order by left_days, due, tag, kind
$$;

create function public.animal_care_alerts(p_today date)
returns table(alert_kind text, severity text, due_date date, animal_id uuid,
  tag text, message text, days_left integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  with due as (
    select 'care_task_' || t.id::text kind, t.due_date due, a.id animal, a.tag,
      t.title action, s.reminder_days window_days
    from public.animal_care_tasks t join public.animals a on a.id=t.animal_id
      cross join public.settings s
    where t.completed_date is null and a.life_status='active'
  ), visible as (
    select *, due - p_today left_days from due where due <= p_today + window_days
  )
  select kind,
    case when left_days < 0 then 'overdue' when left_days = 0 then 'today'
      when left_days <= 3 then 'soon' else 'upcoming' end,
    due, animal, tag,
    tag || ': ' || action || ' — ' || case when left_days < 0 then (-left_days)::text || ' din late'
      when left_days = 0 then 'Aaj' when left_days = 1 then 'Kal' else left_days::text || ' din baad' end ||
      ' (' || to_char(due, 'FMDD Mon') || ')', left_days
  from visible
  order by left_days, due, tag, kind
$$;

revoke all on function public.guard_animal_care_task() from public, anon, authenticated;
revoke all on function public.animal_breeding_alerts(date), public.animal_care_alerts(date) from public, anon, authenticated;
grant execute on function public.animal_breeding_alerts(date), public.animal_care_alerts(date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.animal_breeding_alerts(date), public.animal_care_alerts(date) to anon;
  end if;
end $$;
