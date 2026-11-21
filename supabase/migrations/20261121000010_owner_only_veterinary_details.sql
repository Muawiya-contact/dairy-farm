-- Detailed clinical notes are more sensitive than the shared operational
-- health log. Keep the new fields behind the farm-owner policy.
create table public.health_event_details (
  health_event_id uuid primary key references public.health_events(id) on delete cascade,
  symptoms text check (symptoms is null or length(symptoms) <= 1000),
  diagnosis text check (diagnosis is null or length(diagnosis) <= 300),
  severity text check (severity is null or severity in ('mild','moderate','severe')),
  current_condition text check (current_condition is null or length(current_condition) <= 300),
  medicine_type text check (medicine_type is null or length(medicine_type) <= 120),
  dosage text check (dosage is null or length(dosage) <= 120),
  route text check (route is null or length(route) <= 120),
  treatment_start_date date,
  treatment_end_date date,
  constraint health_event_details_treatment_range check (
    treatment_start_date is null or treatment_end_date is null or treatment_end_date >= treatment_start_date
  )
);

insert into public.health_event_details (
  health_event_id, symptoms, diagnosis, severity, current_condition,
  medicine_type, dosage, route, treatment_start_date, treatment_end_date
)
select id, symptoms, diagnosis, severity, current_condition,
       medicine_type, dosage, route, treatment_start_date, treatment_end_date
  from public.health_events
 where symptoms is not null or diagnosis is not null or severity is not null
    or current_condition is not null or medicine_type is not null or dosage is not null
    or route is not null or treatment_start_date is not null or treatment_end_date is not null;

alter table public.health_events
  drop constraint health_symptoms_length,
  drop constraint health_diagnosis_length,
  drop constraint health_severity_check,
  drop constraint health_current_condition_length,
  drop constraint health_medicine_type_length,
  drop constraint health_dosage_length,
  drop constraint health_route_length,
  drop constraint health_treatment_range,
  drop column symptoms,
  drop column diagnosis,
  drop column severity,
  drop column current_condition,
  drop column medicine_type,
  drop column dosage,
  drop column route,
  drop column treatment_start_date,
  drop column treatment_end_date;

create function private.can_access_veterinary_details()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_farm_owner()
    or (auth.uid() is null and private.demo_access_enabled())
$$;
revoke all on function private.can_access_veterinary_details() from public;
grant execute on function private.can_access_veterinary_details() to authenticated, anon;

alter table public.health_event_details enable row level security;
create policy owner_all on public.health_event_details for all to authenticated
  using ((select private.can_access_veterinary_details()))
  with check ((select private.can_access_veterinary_details()));
revoke all on public.health_event_details from public, anon, authenticated;
grant select, insert on public.health_event_details to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert on public.health_event_details to anon;
    create policy demo_all on public.health_event_details for all to anon
      using ((select private.can_access_veterinary_details()))
      with check ((select private.can_access_veterinary_details()));
  end if;
end $$;

create trigger subscription_write_guard before insert or update or delete on public.health_event_details
for each row execute function private.guard_subscription_write();

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
    animal_id, event_date, kind, title, medicine, vet, cost, next_due_date, expense_id, notes
  ) values (
    p_animal_id, p_event_date, p_kind, trim(p_title), nullif(trim(p_medicine), ''),
    nullif(trim(p_vet), ''), p_cost, p_next_due_date, v_expense_id, nullif(trim(p_notes), '')
  ) returning id into v_event_id;

  if p_symptoms is not null or p_diagnosis is not null or p_severity is not null
     or p_current_condition is not null or p_medicine_type is not null or p_dosage is not null
     or p_route is not null or p_treatment_start_date is not null or p_treatment_end_date is not null then
    insert into public.health_event_details (
      health_event_id, symptoms, diagnosis, severity, current_condition,
      medicine_type, dosage, route, treatment_start_date, treatment_end_date
    ) values (
      v_event_id, nullif(trim(p_symptoms), ''), nullif(trim(p_diagnosis), ''), p_severity,
      nullif(trim(p_current_condition), ''), nullif(trim(p_medicine_type), ''),
      nullif(trim(p_dosage), ''), nullif(trim(p_route), ''), p_treatment_start_date, p_treatment_end_date
    );
  end if;
  return v_event_id;
end $$;
