-- ═══════════════════════════════════════════════════════════════════
-- Supabase security. Exactly one designated Auth user can access farm data.
-- The owner UID is entered into private.app_owner after creating the user.
-- Until then, every API request is denied by row-level security.
-- ═══════════════════════════════════════════════════════════════════
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
revoke all on private.app_owner from public, anon, authenticated;

create function private.is_app_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select user_id = (select auth.uid()) from private.app_owner),
    false
  )
$$;
revoke all on function private.is_app_owner() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_app_owner() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'settings','accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated using ((select private.is_app_owner())) with check ((select private.is_app_owner()))', t);
    execute format('revoke all on %I from public, anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- The report views use caller rights, so their underlying tables keep enforcing RLS.
alter view customer_balances set (security_invoker = true);
alter view animal_status     set (security_invoker = true);
revoke all on customer_balances, animal_status from public, anon;
grant select on customer_balances, animal_status to authenticated;

revoke execute on function customer_month_report(date), milk_month_summary(date),
  expense_month_report(date), pnl_month(date), account_entries(uuid),
  account_month_summary(date), herd_alerts(date), rate_on(uuid, date), farm_today() from anon, public;
grant execute on function customer_month_report(date), milk_month_summary(date),
  expense_month_report(date), pnl_month(date), account_entries(uuid),
  account_month_summary(date), herd_alerts(date), rate_on(uuid, date), farm_today() to authenticated;
