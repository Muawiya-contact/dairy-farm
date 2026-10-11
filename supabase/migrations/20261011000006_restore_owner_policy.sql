-- Restore owner-only access if a previous preview policy was ever applied.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('revoke all on %I from anon', t);
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'preview_all'
    ) then
      execute format('alter policy preview_all on %I rename to owner_all', t);
    end if;
    execute format('alter policy owner_all on %I to authenticated using ((select private.is_app_owner())) with check ((select private.is_app_owner()))', t);
  end loop;
end $$;

revoke all on customer_balances, animal_status from anon;
revoke execute on function customer_month_report(date), milk_month_summary(date),
  expense_month_report(date), pnl_month(date), account_entries(uuid),
  account_month_summary(date), herd_alerts(date), rate_on(uuid, date), farm_today() from anon;
