-- Salary payments are financial history. Corrections need an audited workflow,
-- so do not let direct table updates or deletes silently rewrite that history.
create function public.trg_salary_payment_immutable() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if old.salary_period_id is not null then
    raise exception 'SALARY_PAYMENT_IMMUTABLE: tankhwah ki adaigi seedha badal nahi sakte'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger salary_payment_immutable before update or delete on public.expenses
  for each row execute function public.trg_salary_payment_immutable();

-- Reclassifying a category with existing expenses as salary (or back) would
-- bypass the required period link or change how historic payments are shown.
create function public.trg_salary_category_fixed() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if new.is_salary is distinct from old.is_salary
     and exists (select 1 from public.expenses where category_id = old.id) then
    raise exception 'SALARY_CATEGORY_FIXED: purani entries wali category ki salary qism nahi badal sakte'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger salary_category_fixed before update on public.expense_categories
  for each row execute function public.trg_salary_category_fixed();
