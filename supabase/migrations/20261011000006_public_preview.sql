-- Temporary no-login preview. Anyone with the publishable key can read and edit
-- farm data. Use test data only and replace this policy before a client launch.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('alter policy preview_all on %I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on %I to anon', t);
  end loop;
end $$;

grant select on customer_balances, animal_status to anon;
grant execute on function customer_month_report(date), milk_month_summary(date),
  expense_month_report(date), pnl_month(date), account_entries(uuid),
  account_month_summary(date), herd_alerts(date), rate_on(uuid, date), farm_today() to anon;
