-- Keep owner-only access by default in every project. The staging project can
-- explicitly enable shared, anonymous editing of its invented demo settings.
create table private.demo_access (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false
);
insert into private.demo_access (id) values (1);
revoke all on private.demo_access from public, anon, authenticated;

create function private.demo_access_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select enabled from private.demo_access where id = 1), false)
$$;
revoke all on function private.demo_access_enabled() from public, anon, authenticated;
grant usage on schema private to anon;
grant execute on function private.demo_access_enabled() to anon;

grant select, update on public.settings to anon;
create policy demo_settings_read on public.settings for select to anon
  using ((select private.demo_access_enabled()));
create policy demo_settings_write on public.settings for update to anon
  using ((select private.demo_access_enabled()))
  with check ((select private.demo_access_enabled()));
