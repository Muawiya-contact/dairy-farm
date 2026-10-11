-- Temporary shared preview: any signed-in user can read and edit farm data.
-- Unauthenticated requests remain blocked. Replace this policy before launch.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('alter policy owner_all on %I rename to preview_all', t);
    execute format('alter policy preview_all on %I using (true) with check (true)', t);
  end loop;
end $$;
