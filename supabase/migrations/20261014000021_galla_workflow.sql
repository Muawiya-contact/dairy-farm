-- Step 6: cash reconciliation and auditable manual-payment corrections.
-- Existing report functions remain the source of truth for account balances.

alter table public.payments add column revision integer not null default 1 check (revision > 0);

create table public.payment_audit (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  action text not null check (action in ('update', 'delete')),
  before_row jsonb not null,
  after_row jsonb,
  reason text not null check (length(btrim(reason)) > 0),
  actor_id uuid,
  changed_at timestamptz not null default clock_timestamp()
);
create index payment_audit_customer_idx on public.payment_audit (customer_id, changed_at desc);
alter table public.payment_audit enable row level security;
create policy owner_read on public.payment_audit for select to authenticated
  using ((select private.is_app_owner()));
revoke all on public.payment_audit from public, anon, authenticated;
grant select on public.payment_audit to authenticated;

create function public.account_balance_on(p_account uuid, p_date date)
returns numeric language sql stable security invoker set search_path = public, pg_temp as $$
  select case when a.opening_date <= p_date then a.opening_balance else 0 end
       + coalesce((select sum(e.money_in - e.money_out)
                   from public.account_entries(a.id) e where e.entry_date <= p_date), 0)
  from public.accounts a where a.id = p_account
$$;
revoke all on function public.account_balance_on(uuid,date) from public, anon;
grant execute on function public.account_balance_on(uuid,date) to authenticated;

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  count_date date not null,
  counted_amount numeric(12,2) not null check (counted_amount >= 0),
  expected_balance numeric(12,2) not null,
  difference numeric(12,2) not null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index cash_counts_account_date_idx on public.cash_counts (account_id, count_date desc, created_at desc);
alter table public.cash_counts enable row level security;
create policy owner_all on public.cash_counts for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));
revoke all on public.cash_counts from public, anon, authenticated;
grant select, insert on public.cash_counts to authenticated;

create function public.trg_cash_count() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_kind text; v_active boolean;
begin
  select kind, active into v_kind, v_active from public.accounts where id = new.account_id;
  if v_kind is distinct from 'cash' or not coalesce(v_active, false) then
    raise exception 'CASH_ACCOUNT_REQUIRED: active cash account chunein' using errcode = 'P0001';
  end if;
  if new.count_date > public.farm_today() then
    raise exception 'FUTURE_DATE: aaj se aage cash count nahi ho sakta' using errcode = 'P0001';
  end if;
  new.expected_balance := public.account_balance_on(new.account_id, new.count_date);
  new.difference := new.counted_amount - new.expected_balance;
  new.reason := nullif(btrim(new.reason), '');
  if new.difference <> 0 and new.reason is null then
    raise exception 'COUNT_REASON_REQUIRED: farq ki wajah likhein' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cash_count_calculate before insert on public.cash_counts
  for each row execute function public.trg_cash_count();
create trigger lock_cash_counts before insert on public.cash_counts
  for each row execute function public.trg_month_lock('count_date');
create function public.trg_cash_count_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'CASH_COUNT_IMMUTABLE: nayi ginti likhein' using errcode = 'P0001';
end $$;
create trigger cash_count_immutable before update or delete on public.cash_counts
  for each row execute function public.trg_cash_count_immutable();

create function public.trg_transfer_rules() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if new.transfer_date > public.farm_today() then
    raise exception 'FUTURE_DATE: aaj se aage transfer nahi ho sakta' using errcode = 'P0001';
  end if;
  if (select count(*) from public.accounts a
      where a.id in (new.from_account_id, new.to_account_id) and a.active) <> 2 then
    raise exception 'ACCOUNT_INACTIVE: dono active account chunein' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger transfer_rules before insert or update on public.transfers
  for each row execute function public.trg_transfer_rules();

create function public.trg_payment_rules() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.delivery_id is not null and pg_trigger_depth() = 1 then
      raise exception 'AUTO_PAYMENT: Naqd payment doodh entry se banti hai' using errcode = 'P0001';
    end if;
  else
    if old.delivery_id is not null then
      if pg_trigger_depth() = 1 then
        raise exception 'AUTO_PAYMENT: Naqd payment doodh entry se badlein' using errcode = 'P0001';
      end if;
    else
      v_reason := nullif(btrim(current_setting('app.payment_change_reason', true)), '');
      if v_reason is null then
        raise exception 'PAYMENT_REASON_REQUIRED: correction ki wajah likhein' using errcode = 'P0001';
      end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.customer_id <> old.customer_id or new.kind <> old.kind
       or new.delivery_id is distinct from old.delivery_id then
      raise exception 'PAYMENT_IDENTITY: customer aur qism nahi badal sakti' using errcode = 'P0001';
    end if;
    new.revision := old.revision + 1;
  end if;
  if new.payment_date > public.farm_today() then
    raise exception 'FUTURE_DATE: aaj se aage wusooli nahi ho sakti' using errcode = 'P0001';
  end if;
  if new.kind = 'discount' and (new.method is not null or new.account_id is not null) then
    raise exception 'DISCOUNT_ACCOUNT: riayat kisi account mein paisa nahi' using errcode = 'P0001';
  end if;
  if (select kind from public.customers where id = new.customer_id) = 'cash'
     and new.delivery_id is null then
    raise exception 'AUTO_PAYMENT: Naqd customer ki alag wusooli nahi' using errcode = 'P0001';
  end if;
  if new.account_id is not null and not coalesce((select active from public.accounts where id = new.account_id), false) then
    raise exception 'ACCOUNT_INACTIVE: active account chunein' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payment_rules before insert or update or delete on public.payments
  for each row execute function public.trg_payment_rules();

create function public.trg_payment_audit() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_reason text;
begin
  v_reason := coalesce(nullif(btrim(current_setting('app.payment_change_reason', true)), ''),
                       'Naqd doodh entry badli');
  insert into public.payment_audit (payment_id, customer_id, action, before_row, after_row, reason, actor_id)
  values (old.id, old.customer_id, lower(tg_op), to_jsonb(old),
          case when tg_op = 'UPDATE' then to_jsonb(new) else null end,
          v_reason, auth.uid());
  return null;
end $$;
revoke all on function public.trg_payment_audit() from public, anon, authenticated;
create trigger payment_audit_after after update or delete on public.payments
  for each row execute function public.trg_payment_audit();

create function public.correct_manual_payment(
  p_id uuid, p_revision integer, p_date date, p_amount numeric,
  p_method text, p_account uuid, p_reason text
) returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_payment public.payments; v_revision integer;
begin
  select * into v_payment from public.payments where id = p_id for update;
  if not found or v_payment.revision <> p_revision then
    raise exception 'PAYMENT_STALE: record badal gaya, dobara load karein' using errcode = 'P0001';
  end if;
  if v_payment.delivery_id is not null then
    raise exception 'AUTO_PAYMENT: Naqd payment doodh entry se badlein' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_reason), '') is null or p_date > public.farm_today()
     or p_amount <= 0 or p_amount <> round(p_amount, 2)
     or (v_payment.kind = 'payment' and (p_method is null or p_account is null))
     or (v_payment.kind = 'discount' and (p_method is not null or p_account is not null)) then
    raise exception 'PAYMENT_INVALID: tareekh, raqam, account aur wajah check karein' using errcode = 'P0001';
  end if;
  perform set_config('app.payment_change_reason', btrim(p_reason), true);
  update public.payments set payment_date = p_date, amount = p_amount,
    method = p_method, account_id = p_account
  where id = p_id and revision = p_revision returning revision into v_revision;
  if not found then
    raise exception 'PAYMENT_STALE: record badal gaya, dobara load karein' using errcode = 'P0001';
  end if;
  return v_revision;
end $$;
revoke all on function public.correct_manual_payment(uuid,integer,date,numeric,text,uuid,text) from public, anon;
grant execute on function public.correct_manual_payment(uuid,integer,date,numeric,text,uuid,text) to authenticated;

create function public.void_manual_payment(p_id uuid, p_revision integer, p_reason text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_id for update;
  if not found or v_payment.revision <> p_revision then
    raise exception 'PAYMENT_STALE: record badal gaya, dobara load karein' using errcode = 'P0001';
  end if;
  if v_payment.delivery_id is not null then
    raise exception 'AUTO_PAYMENT: Naqd payment doodh entry se badlein' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'PAYMENT_REASON_REQUIRED: correction ki wajah likhein' using errcode = 'P0001';
  end if;
  perform set_config('app.payment_change_reason', btrim(p_reason), true);
  delete from public.payments where id = p_id and revision = p_revision;
end $$;
revoke all on function public.void_manual_payment(uuid,integer,text) from public, anon;
grant execute on function public.void_manual_payment(uuid,integer,text) to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select, insert on public.cash_counts to anon;
    create policy demo_all on public.cash_counts for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
    grant select on public.payment_audit to anon;
    create policy demo_read on public.payment_audit for select to anon
      using ((select private.demo_access_enabled()));
    grant execute on function public.account_balance_on(uuid,date),
      public.correct_manual_payment(uuid,integer,date,numeric,text,uuid,text),
      public.void_manual_payment(uuid,integer,text) to anon;
  end if;
end $$;
