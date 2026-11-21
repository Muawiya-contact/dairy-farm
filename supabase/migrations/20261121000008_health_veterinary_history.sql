alter table public.health_events
  add column symptoms text,
  add column diagnosis text,
  add column severity text,
  add column current_condition text,
  add column medicine_type text,
  add column dosage text,
  add column route text,
  add column treatment_start_date date,
  add column treatment_end_date date,
  add constraint health_symptoms_length check (symptoms is null or length(symptoms) <= 1000),
  add constraint health_diagnosis_length check (diagnosis is null or length(diagnosis) <= 300),
  add constraint health_severity_check check (severity is null or severity in ('mild','moderate','severe')),
  add constraint health_current_condition_length check (current_condition is null or length(current_condition) <= 300),
  add constraint health_medicine_type_length check (medicine_type is null or length(medicine_type) <= 120),
  add constraint health_dosage_length check (dosage is null or length(dosage) <= 120),
  add constraint health_route_length check (route is null or length(route) <= 120),
  add constraint health_treatment_range check (
    treatment_start_date is null or treatment_end_date is null or treatment_end_date >= treatment_start_date
  );

create or replace function public.record_detailed_health_event(
  p_animal_id uuid, p_event_date date, p_kind text, p_title text,
  p_cost numeric, p_next_due_date date, p_category_id uuid, p_account_id uuid,
  p_medicine text, p_vet text, p_notes text, p_symptoms text, p_diagnosis text,
  p_severity text, p_current_condition text, p_medicine_type text, p_dosage text,
  p_route text, p_treatment_start_date date, p_treatment_end_date date
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_event_id uuid; v_expense_id uuid;
begin
  if p_animal_id is null or p_event_date is null or nullif(trim(p_title), '') is null
     or length(trim(p_title)) > 180
     or p_kind is null or p_kind not in ('vaccine','treatment','deworming','checkup','other')
     or p_cost is null or p_cost < 0
     or (p_cost > 0 and (p_category_id is null or p_account_id is null))
     or (p_medicine is not null and length(p_medicine) > 180)
     or (p_vet is not null and length(p_vet) > 180)
     or (p_notes is not null and length(p_notes) > 1000)
     or (p_severity is not null and p_severity not in ('mild','moderate','severe'))
     or (p_symptoms is not null and length(p_symptoms) > 1000)
     or (p_diagnosis is not null and length(p_diagnosis) > 300)
     or (p_current_condition is not null and length(p_current_condition) > 300)
     or (p_medicine_type is not null and length(p_medicine_type) > 120)
     or (p_dosage is not null and length(p_dosage) > 120)
     or (p_route is not null and length(p_route) > 120)
     or (p_treatment_start_date is not null and p_treatment_end_date is not null
         and p_treatment_end_date < p_treatment_start_date) then
    raise exception 'Invalid health event';
  end if;

  if p_cost > 0 then
    insert into public.expenses (expense_date, category_id, amount, account_id, note)
    values (p_event_date, p_category_id, p_cost, p_account_id, trim(p_title))
    returning id into v_expense_id;
  end if;

  insert into public.health_events (
    animal_id, event_date, kind, title, medicine, vet, cost, next_due_date,
    expense_id, notes, symptoms, diagnosis, severity, current_condition,
    medicine_type, dosage, route, treatment_start_date, treatment_end_date
  ) values (
    p_animal_id, p_event_date, p_kind, trim(p_title), nullif(trim(p_medicine), ''),
    nullif(trim(p_vet), ''), p_cost, p_next_due_date, v_expense_id, nullif(trim(p_notes), ''),
    nullif(trim(p_symptoms), ''), nullif(trim(p_diagnosis), ''), p_severity,
    nullif(trim(p_current_condition), ''), nullif(trim(p_medicine_type), ''),
    nullif(trim(p_dosage), ''), nullif(trim(p_route), ''),
    p_treatment_start_date, p_treatment_end_date
  ) returning id into v_event_id;
  return v_event_id;
end $$;

create or replace function public.record_health_event(
  p_animal_id uuid, p_event_date date, p_kind text, p_title text,
  p_cost numeric, p_next_due_date date, p_category_id uuid, p_account_id uuid
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  return public.record_detailed_health_event(
    p_animal_id, p_event_date, p_kind, p_title, p_cost, p_next_due_date,
    p_category_id, p_account_id, null, null, null, null, null, null, null,
    null, null, null, null, null
  );
end $$;

revoke all on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) from public, anon;
revoke all on function public.record_detailed_health_event(uuid,date,text,text,numeric,date,uuid,uuid,text,text,text,text,text,text,text,text,text,text,date,date) from public, anon;
grant execute on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) to authenticated;
grant execute on function public.record_detailed_health_event(uuid,date,text,text,numeric,date,uuid,uuid,text,text,text,text,text,text,text,text,text,text,date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) to anon;
    grant execute on function public.record_detailed_health_event(uuid,date,text,text,numeric,date,uuid,uuid,text,text,text,text,text,text,text,text,text,text,date,date) to anon;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('health-records', 'health-records', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
  set name = excluded.name,
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.health_event_attachments (
  id uuid primary key default gen_random_uuid(),
  health_event_id uuid not null references public.health_events(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 180),
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  constraint health_attachment_path_matches_event check (
    split_part(storage_path, '/', 1) = health_event_id::text
    and array_length(string_to_array(storage_path, '/'), 1) = 2
    and split_part(storage_path, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  )
);
create trigger subscription_write_guard before insert or update or delete on public.health_event_attachments
for each row execute function private.guard_subscription_write();
create index health_attachment_event_idx on public.health_event_attachments(health_event_id, created_at);

alter table public.health_event_attachments enable row level security;
create policy owner_all on public.health_event_attachments for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
revoke all on public.health_event_attachments from public, anon;
grant select, insert, delete on public.health_event_attachments to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert, delete on public.health_event_attachments to anon;
    create policy demo_all on public.health_event_attachments for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
  end if;
end $$;

create function private.can_access_health_event_attachment(p_health_event_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_app_owner()
    or (private.demo_access_enabled() and exists (
      select 1 from public.health_events h where h.id::text = p_health_event_id
    ))
$$;
revoke all on function private.can_access_health_event_attachment(text) from public;
grant execute on function private.can_access_health_event_attachment(text) to authenticated, anon;

create policy health_records_read on storage.objects for select to authenticated, anon
  using (bucket_id = 'health-records' and private.can_access_health_event_attachment(split_part(name, '/', 1)));
create policy health_records_add on storage.objects for insert to authenticated, anon
  with check (bucket_id = 'health-records' and private.can_access_health_event_attachment(split_part(name, '/', 1)));
create policy health_records_remove on storage.objects for delete to authenticated, anon
  using (bucket_id = 'health-records' and private.can_access_health_event_attachment(split_part(name, '/', 1)));
