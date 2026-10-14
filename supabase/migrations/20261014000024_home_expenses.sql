-- Step 7: make home costs explicit without changing earlier expense history.
do $$
begin
  if exists (
    select 1 from public.expense_categories
    where lower(btrim(name)) = 'ghar ka kharcha' and (is_farm_cost or is_salary)
  ) then
    raise exception 'HOME_CATEGORY_CONFLICT: existing Ghar ka kharcha category needs review' using errcode = 'P0001';
  end if;
end $$;

insert into public.expense_categories (name, is_farm_cost, is_salary, active, sort_order)
values ('Ghar ka kharcha', false, false, true, 21)
on conflict do nothing;

update public.expense_categories set active = true
where lower(btrim(name)) = 'ghar ka kharcha';

alter table public.expense_categories add constraint home_category_personal
  check (lower(btrim(name)) <> 'ghar ka kharcha' or (not is_farm_cost and not is_salary));

-- Existing expenses already appear in account_entries and personal_expenses.
-- Enforce entry rules at the database as well as in the owner-facing form.
create function public.trg_expense_rules() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_opening date; v_account_active boolean; v_category_active boolean;
begin
  if new.expense_date > public.farm_today() then
    raise exception 'FUTURE_DATE: aaj se aage kharcha nahi ho sakta' using errcode = 'P0001';
  end if;
  select opening_date, active into v_opening, v_account_active
    from public.accounts where id = new.account_id;
  if not coalesce(v_account_active, false) then
    raise exception 'ACCOUNT_INACTIVE: active account chunein' using errcode = 'P0001';
  end if;
  if new.expense_date < v_opening then
    raise exception 'EXPENSE_BEFORE_ACCOUNT: account khulne ke baad ki tareekh chunein' using errcode = 'P0001';
  end if;
  select active into v_category_active from public.expense_categories where id = new.category_id;
  if not coalesce(v_category_active, false) then
    raise exception 'CATEGORY_INACTIVE: active kharcha category chunein' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger expense_rules before insert or update on public.expenses
  for each row execute function public.trg_expense_rules();
