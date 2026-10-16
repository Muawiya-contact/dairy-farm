-- A narrow anonymous RPC for scheduled database activity. It exposes no farm rows.
create table private.heartbeat (
  id integer primary key default 1 check (id = 1),
  last_ping timestamptz not null
);
alter table private.heartbeat enable row level security;
revoke all on private.heartbeat from public, anon, authenticated;

create function public.keep_alive() returns timestamptz
language sql security definer set search_path = '' as $$
  insert into private.heartbeat (id, last_ping) values (1, now())
  on conflict (id) do update set last_ping = now()
  returning last_ping;
$$;
revoke all on function public.keep_alive() from public, anon, authenticated;
grant execute on function public.keep_alive() to anon;
