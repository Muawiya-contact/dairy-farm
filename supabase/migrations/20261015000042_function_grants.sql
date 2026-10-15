-- PostgreSQL grants PUBLIC EXECUTE on new functions by default. Global defaults
-- must be changed too: per-schema REVOKE does not override a global grant.
alter default privileges revoke execute on functions from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke all on tables from public, anon;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;

-- Preserve the intentionally open staging demo. Production must not inherit
-- any anonymous or PUBLIC grants, even if Supabase supplied broad defaults.
do $$ begin
  if not (select enabled from private.demo_access where id = 1) then
    revoke all on all tables in schema public from public, anon;
    revoke execute on all functions in schema public from public, anon;
  end if;
end $$;
