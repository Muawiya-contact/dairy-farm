-- Owner-controlled month closing. Both UI actions are transactional and
-- idempotent, while every change is recorded separately from the current lock.
create table public.month_lock_events (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  action text not null check (action in ('close', 'reopen')),
  reason text,
  actor_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index month_lock_events_month_idx on public.month_lock_events (month, created_at desc);
alter table public.month_lock_events enable row level security;
create policy owner_read on public.month_lock_events for select to authenticated
  using ((select private.is_app_owner()));
revoke all on public.month_lock_events from public, anon, authenticated;
grant select on public.month_lock_events to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.month_lock_events to anon;
    create policy demo_read on public.month_lock_events for select to anon
      using ((select private.demo_access_enabled()));
  end if;
end $$;

-- Closing and financial writes take the same transaction lock. This prevents
-- a write that began just before the close from committing behind it.
create or replace function public.trg_month_lock() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare d_new date; d_old date; v_month date;
begin
  if tg_op <> 'DELETE' then d_new := (to_jsonb(new) ->> tg_argv[0])::date; end if;
  if tg_op <> 'INSERT' then d_old := (to_jsonb(old) ->> tg_argv[0])::date; end if;
  for v_month in
    select distinct date_trunc('month', d)::date
    from (values (d_new), (d_old)) as dates(d)
    where d is not null order by 1
  loop
    perform pg_advisory_xact_lock(1499, (extract(year from v_month)::integer * 12 + extract(month from v_month)::integer));
  end loop;
  if exists (select 1 from public.month_locks m
             where m.month = date_trunc('month', d_new)::date
                or m.month = date_trunc('month', d_old)::date) then
    raise exception 'MONTH_LOCKED: yeh maheena band hai, pehle kholein' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create function public.close_farm_month(p_month date, p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_month date;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'MONTH_FORBIDDEN: ijazat nahi hai' using errcode = 'P0001';
  end if;
  v_month := date_trunc('month', p_month)::date;
  if p_month is null or p_month <> v_month or v_month >= date_trunc('month', public.farm_today())::date
     or length(coalesce(p_note, '')) > 500 then
    raise exception 'MONTH_INVALID: sirf guzra hua poora maheena band karein' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(1499, (extract(year from v_month)::integer * 12 + extract(month from v_month)::integer));
  -- These profile edits can change historical totals without writing a dated
  -- ledger row. Wait for any in-flight edit before making the close visible.
  lock table public.accounts, public.customers, public.expense_categories in share mode;
  insert into public.month_locks (month, note) values (v_month, nullif(btrim(p_note), ''))
    on conflict (month) do nothing;
  if not found then return false; end if;
  insert into public.month_lock_events (month, action, reason, actor_id)
    values (v_month, 'close', nullif(btrim(p_note), ''), auth.uid());
  return true;
end $$;

create function public.reopen_farm_month(p_month date, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_month date;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'MONTH_FORBIDDEN: ijazat nahi hai' using errcode = 'P0001';
  end if;
  v_month := date_trunc('month', p_month)::date;
  if p_month is null or p_month <> v_month or length(btrim(coalesce(p_reason, ''))) < 5
     or length(p_reason) > 500 then
    raise exception 'MONTH_REASON_REQUIRED: dobara kholne ki wajah likhein' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(1499, (extract(year from v_month)::integer * 12 + extract(month from v_month)::integer));
  delete from public.month_locks where month = v_month;
  if not found then return false; end if;
  insert into public.month_lock_events (month, action, reason, actor_id)
    values (v_month, 'reopen', btrim(p_reason), auth.uid());
  return true;
end $$;

revoke all on function public.close_farm_month(date, text), public.reopen_farm_month(date, text) from public;
grant execute on function public.close_farm_month(date, text), public.reopen_farm_month(date, text) to authenticated;
revoke insert, update, delete on public.month_locks from authenticated, anon;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.close_farm_month(date, text), public.reopen_farm_month(date, text) to anon;
  end if;
end $$;

-- Changing an account's opening amount/date would rewrite every later closed
-- ledger balance, even though dated transactions themselves are locked.
create function public.trg_closed_account_opening() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if (new.opening_balance is distinct from old.opening_balance
      or new.opening_date is distinct from old.opening_date)
     and exists (select 1 from public.month_locks where month >= date_trunc('month', old.opening_date)::date) then
    raise exception 'MONTH_LOCKED: purana account balance band maheene ko badal sakta hai' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger closed_account_opening before update of opening_balance, opening_date on public.accounts
  for each row execute function public.trg_closed_account_opening();

create function public.trg_closed_customer_opening() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if (new.opening_balance is distinct from old.opening_balance
      or new.opening_date is distinct from old.opening_date)
     and exists (select 1 from public.month_locks where month >= date_trunc('month', old.opening_date)::date) then
    raise exception 'MONTH_LOCKED: customer ka purana hisaab band maheene ko badal sakta hai' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger closed_customer_opening before update of opening_balance, opening_date on public.customers
  for each row execute function public.trg_closed_customer_opening();

-- Reclassifying a used expense from farm to personal (or back) would also
-- rewrite profit for a closed month without touching the expense row.
create function public.trg_closed_expense_category() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if new.is_farm_cost is distinct from old.is_farm_cost
     and exists (
       select 1 from public.expenses e join public.month_locks m
         on m.month = date_trunc('month', e.expense_date)::date
       where e.category_id = old.id
     ) then
    raise exception 'MONTH_LOCKED: is qism ka purana kharcha band maheene mein hai' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger closed_expense_category before update of is_farm_cost on public.expense_categories
  for each row execute function public.trg_closed_expense_category();
