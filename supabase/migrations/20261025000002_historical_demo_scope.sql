-- Defense in depth: only explicitly fictional archive rows are public in demo mode.
-- Real source rows remain private even if demo_access is enabled accidentally.
do $$ begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'historical_records'
               and policyname = 'historical_demo_read') then
    alter policy historical_demo_read on public.historical_records to anon
      using ((select private.demo_access_enabled()) and details @> '{"demo": true}'::jsonb);
  end if;
end $$;
