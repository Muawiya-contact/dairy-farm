-- Month controls and their audit rows are written by security-definer RPCs,
-- not by browser table grants. The original grant-based trigger install did
-- not include these tables. Guard them so expiry makes the farm read-only.
create trigger subscription_write_guard before insert or update or delete on public.month_locks
for each row execute function private.guard_subscription_write();

create trigger subscription_write_guard before insert or update or delete on public.month_lock_events
for each row execute function private.guard_subscription_write();

-- This audit table is also server-written. Protect it as a separate layer so
-- future payment workflows cannot append records after subscription expiry.
create trigger subscription_write_guard before insert or update or delete on public.payment_audit
for each row execute function private.guard_subscription_write();
