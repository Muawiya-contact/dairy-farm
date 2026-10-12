-- Record a paid health event and its farm expense in one transaction.
create function public.record_health_event(
  p_animal_id uuid, p_event_date date, p_kind text, p_title text,
  p_cost numeric, p_next_due_date date, p_category_id uuid, p_account_id uuid
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_event_id uuid;
declare v_expense_id uuid;
begin
  if p_animal_id is null or p_event_date is null or nullif(trim(p_title), '') is null
     or p_kind is null or p_kind not in ('vaccine','treatment','deworming','checkup','other')
     or p_cost is null or p_cost < 0
     or (p_cost > 0 and (p_category_id is null or p_account_id is null)) then
    raise exception 'Invalid health event';
  end if;
  if p_cost > 0 then
    insert into public.expenses (expense_date, category_id, amount, account_id, note)
    values (p_event_date, p_category_id, p_cost, p_account_id, trim(p_title))
    returning id into v_expense_id;
  end if;
  insert into public.health_events (
    animal_id, event_date, kind, title, cost, next_due_date, expense_id
  ) values (
    p_animal_id, p_event_date, p_kind, trim(p_title), p_cost, p_next_due_date, v_expense_id
  ) returning id into v_event_id;
  return v_event_id;
end $$;
revoke all on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) from public;
grant execute on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid) to anon;
  end if;
end $$;
