-- Step 7: save each agreed monthly salary separately from the current staff rate.
-- Salary payments remain cash-basis expenses in the existing Galla and P&L.
alter table public.staff add column updated_at timestamptz not null default now();
create trigger staff_touch before update on public.staff
  for each row execute function public.trg_touch();

alter table public.expense_categories add constraint salary_category_farm
  check (not is_salary or is_farm_cost);

create table public.salary_periods (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  salary_month date not null check (extract(day from salary_month) = 1),
  agreed_amount numeric(12,2) not null check (agreed_amount > 0),
  created_at timestamptz not null default now(),
  unique (staff_id, salary_month)
);

alter table public.expenses add column salary_period_id uuid
  references public.salary_periods(id) on delete restrict;
create index expenses_salary_period_idx on public.expenses(salary_period_id)
  where salary_period_id is not null;

-- Old salary expenses have no recorded pay period. Preserve their amount as
-- fully paid in their payment month instead of inventing an unpaid balance.
do $$
begin
  if exists (
    select 1 from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    where c.is_salary and e.staff_id is null
  ) then
    raise exception 'SALARY_LEGACY_UNASSIGNED: assign staff to old salary expenses before migrating'
      using errcode = 'P0001';
  end if;
end $$;

insert into public.salary_periods (staff_id, salary_month, agreed_amount)
select e.staff_id, date_trunc('month', e.expense_date)::date, sum(e.amount)
from public.expenses e
join public.expense_categories c on c.id = e.category_id
where c.is_salary
group by e.staff_id, date_trunc('month', e.expense_date)::date;

update public.expenses e set salary_period_id = p.id
from public.expense_categories c, public.salary_periods p
where c.id = e.category_id and c.is_salary
  and p.staff_id = e.staff_id
  and p.salary_month = date_trunc('month', e.expense_date)::date;

alter table public.salary_periods enable row level security;
create policy owner_all on public.salary_periods for all to authenticated
  using ((select private.is_app_owner()))
  with check ((select private.is_app_owner()));
revoke all on public.salary_periods from public, anon;
grant select, insert, update, delete on public.salary_periods to authenticated;
do $$
begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert, update, delete on public.salary_periods to anon;
    create policy demo_all on public.salary_periods for all to anon
      using ((select private.demo_access_enabled()))
      with check ((select private.demo_access_enabled()));
  end if;
end $$;

create function public.trg_salary_period_rules() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare v_paid numeric;
begin
  if new.salary_month > date_trunc('month', public.farm_today())::date then
    raise exception 'SALARY_FUTURE_MONTH: aane wale mahine ki tankhwah abhi na kholein'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.staff_id <> old.staff_id or new.salary_month <> old.salary_month then
      raise exception 'SALARY_PERIOD_FIXED: staff aur maheena badal nahi sakte'
        using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into v_paid
      from public.expenses where salary_period_id = old.id;
    if new.agreed_amount < v_paid then
      raise exception 'SALARY_BELOW_PAID: tay shuda raqam ada shuda raqam se kam hai'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger salary_period_rules before insert or update on public.salary_periods
  for each row execute function public.trg_salary_period_rules();
create trigger lock_salary_periods before insert or update or delete on public.salary_periods
  for each row execute function public.trg_month_lock('salary_month');

create or replace function public.trg_expense_rules() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_opening date;
  v_account_active boolean;
  v_category_active boolean;
  v_is_salary boolean;
  v_staff uuid;
  v_salary_month date;
  v_agreed numeric;
  v_paid numeric;
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
  select active, is_salary into v_category_active, v_is_salary
    from public.expense_categories where id = new.category_id;
  if not coalesce(v_category_active, false) then
    raise exception 'CATEGORY_INACTIVE: active kharcha category chunein' using errcode = 'P0001';
  end if;
  if v_is_salary then
    if new.staff_id is null or new.salary_period_id is null then
      raise exception 'SALARY_LINK_REQUIRED: mulazim aur tankhwah ka maheena chunein'
        using errcode = 'P0001';
    end if;
    -- Lock the period before counting payments, including concurrent submissions.
    select staff_id, salary_month, agreed_amount into v_staff, v_salary_month, v_agreed
      from public.salary_periods where id = new.salary_period_id for update;
    if v_staff is distinct from new.staff_id then
      raise exception 'SALARY_STAFF_MISMATCH: tankhwah doosray mulazim ki hai'
        using errcode = 'P0001';
    end if;
    if v_salary_month > date_trunc('month', new.expense_date)::date then
      raise exception 'SALARY_ADVANCE_NOT_ENABLED: maheena shuru hone ke baad ada karein'
        using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into v_paid from public.expenses
      where salary_period_id = new.salary_period_id and id <> new.id;
    if v_paid + new.amount > v_agreed then
      raise exception 'SALARY_OVERPAID: baqi tankhwah se zyada raqam hai'
        using errcode = 'P0001';
    end if;
  elsif new.salary_period_id is not null then
    raise exception 'SALARY_CATEGORY_REQUIRED: tankhwah category chunein'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
