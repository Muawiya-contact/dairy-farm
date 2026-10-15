-- Keep the owner account and permit explicitly listed production collaborators.
-- This table is empty on staging and production until an administrator adds
-- production Auth user IDs. The existing owner remains allowed.
create table private.app_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.app_editors enable row level security;
revoke all on private.app_editors from public, anon, authenticated;

-- Existing table policies and month-close RPCs already call this function.
-- Keep its name for compatibility; it now checks the owner or an editor.
create or replace function private.is_app_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select user_id = (select auth.uid()) from private.app_owner),
    false
  ) or exists (
    select 1 from private.app_editors
    where user_id = (select auth.uid())
  )
$$;
revoke all on function private.is_app_owner() from public, anon, authenticated;
grant execute on function private.is_app_owner() to authenticated;
