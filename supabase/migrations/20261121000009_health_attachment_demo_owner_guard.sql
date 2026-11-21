-- Veterinary records are more sensitive than the farm-wide operational data
-- shared with app_editors. Only the designated farm owner may access them.
create function private.is_farm_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select user_id = auth.uid() from private.app_owner), false)
$$;
revoke all on function private.is_farm_owner() from public, anon, authenticated;
grant execute on function private.is_farm_owner() to authenticated;

drop policy owner_all on public.health_event_attachments;
create policy owner_all on public.health_event_attachments for all to authenticated
  using ((select private.is_farm_owner())) with check ((select private.is_farm_owner()));

create or replace function private.can_access_health_event_attachment(p_health_event_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_farm_owner()
    or (auth.uid() is null and private.demo_access_enabled() and exists (
      select 1 from public.health_events h where h.id::text = p_health_event_id
    ))
$$;
revoke all on function private.can_access_health_event_attachment(text) from public;
grant execute on function private.can_access_health_event_attachment(text) to authenticated, anon;
