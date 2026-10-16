-- Farm access remains readable after expiry. Only a database administrator can
-- set the expiry; browser roles have no access to this private table.
create table private.farm_subscription (
  singleton boolean primary key default true check (singleton),
  expires_on date,
  updated_at timestamptz not null default now()
);
insert into private.farm_subscription (singleton) values (true);
revoke all on private.farm_subscription from public, anon, authenticated;

create function public.subscription_status()
returns table (expires_on date, farm_date date, days_remaining integer, read_only boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_app_owner() and not private.demo_access_enabled() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return query select s.expires_on, public.farm_today(),
    case when s.expires_on is null then null else s.expires_on - public.farm_today() end,
    s.expires_on is not null and public.farm_today() > s.expires_on
  from private.farm_subscription s where s.singleton = true;
end
$$;
revoke all on function public.subscription_status() from public, anon, authenticated;
grant execute on function public.subscription_status() to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.subscription_status() to anon;
  end if;
end $$;

create function private.guard_subscription_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_expiry date;
begin
  select expires_on into v_expiry from private.farm_subscription where singleton = true;
  if v_expiry is not null and public.farm_today() > v_expiry then
    raise exception 'SUBSCRIPTION_EXPIRED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.guard_subscription_write() from public, anon, authenticated;

-- Includes indirect writes made by RPCs and audit tables. New app tables must
-- receive the same trigger in their own migration.
do $$ declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'INSERT')
  loop
    execute format('create trigger subscription_write_guard before insert or update or delete on public.%I for each row execute function private.guard_subscription_write()', t.relname);
  end loop;
end $$;
