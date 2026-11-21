-- Let the form keep private clinical fields available only to the designated
-- owner while preserving the ordinary health-event save for farm editors.
create function public.can_manage_veterinary_details()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_veterinary_details()
$$;
revoke all on function public.can_manage_veterinary_details() from public, anon, authenticated;
grant execute on function public.can_manage_veterinary_details() to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.can_manage_veterinary_details() to anon;
  end if;
end $$;

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

  -- Editors may add the shared health record and linked expense. Ignore only
  -- the private clinical fields unless the caller is the farm owner (or the
  -- explicitly enabled anonymous staging demo).
  if private.can_access_veterinary_details()
     and (p_symptoms is not null or p_diagnosis is not null or p_severity is not null
       or p_current_condition is not null or p_medicine_type is not null or p_dosage is not null
       or p_route is not null or p_treatment_start_date is not null or p_treatment_end_date is not null) then
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
