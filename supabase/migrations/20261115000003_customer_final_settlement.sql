-- A Khata can only conclude through this recorded settlement path. It records
-- whether a due amount was collected, waived, or an existing customer advance
-- was returned; it never rewrites the original milk or payment history.
alter table public.payments drop constraint payments_kind_check;
alter table public.payments
  add constraint payments_kind_check check (kind in ('payment', 'discount', 'refund'));
alter table public.payments drop constraint payment_needs_account;
alter table public.payments drop constraint discount_no_account;
alter table public.payments add constraint payment_account_rules check (
  (kind = 'discount' and method is null and account_id is null)
  or (kind in ('payment', 'refund') and method is not null and account_id is not null)
);

create table public.customer_closures (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  closed_date date not null,
  settlement_kind text not null check (settlement_kind in ('payment', 'discount', 'refund', 'zero')),
  amount numeric(12,2) not null check (amount >= 0),
  payment_id uuid unique references public.payments(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 500),
  actor_id uuid,
  created_at timestamptz not null default now(),
  reopened_at timestamptz,
  check ((settlement_kind = 'zero') = (amount = 0)),
  check ((settlement_kind = 'zero') = (payment_id is null))
);
create index customer_closures_customer_idx on public.customer_closures(customer_id, closed_date desc, created_at desc);
alter table public.customer_closures enable row level security;
create policy customer_closures_owner_read on public.customer_closures for select to authenticated
  using ((select private.is_app_owner()));
revoke all on public.customer_closures from public, anon, authenticated;
grant select on public.customer_closures to authenticated;
create trigger subscription_write_guard before insert or update or delete on public.customer_closures
  for each row execute function private.guard_subscription_write();

-- Directly toggling a customer to Band would otherwise lose the conclusion
-- reason and could hide an unsettled balance. Reopening is also recorded.
create or replace function public.trg_customer_closure_guard() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
begin
  if old.active and not new.active
     and current_setting('app.customer_finalizing', true) is distinct from 'on' then
    raise exception 'CUSTOMER_CLOSE_USE_FINALIZE' using errcode = 'P0001';
  end if;
  if not old.active and new.active
     and current_setting('app.customer_reopening', true) is distinct from 'on' then
    raise exception 'CUSTOMER_REOPEN_USE_RPC' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger customer_closure_guard before update of active on public.customers
  for each row execute function public.trg_customer_closure_guard();

-- A settlement can be changed only after the Khata has been reopened. This
-- protects the saved conclusion and its Galla entry from quiet edits/voids.
create or replace function public.trg_closed_settlement_payment_guard() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare v_id uuid := coalesce(new.id, old.id);
begin
  if tg_op <> 'INSERT' and exists (
    select 1 from public.customer_closures
    where payment_id = v_id and reopened_at is null
  ) then
    raise exception 'CLOSURE_SETTLEMENT_IMMUTABLE' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger closed_settlement_payment_guard before update or delete on public.payments
  for each row execute function public.trg_closed_settlement_payment_guard();

-- The existing manual-payment guard is extended for a refund: it is a real
-- money-out entry in an active account, unlike Riayat which has no cash flow.
create or replace function public.trg_payment_rules() returns trigger language plpgsql security invoker
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
  if new.kind in ('payment', 'refund') and (new.method is null or new.account_id is null) then
    raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001';
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

create or replace function public.correct_manual_payment(
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
     or (v_payment.kind in ('payment', 'refund') and (p_method is null or p_account is null))
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

create or replace function public.finalize_customer_khata(
  p_customer uuid, p_action text, p_date date, p_method text,
  p_account uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers%rowtype; v_balance numeric(12,2); v_amount numeric(12,2);
  v_payment_id uuid; v_closure_id uuid; v_account_opening date;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Older payment triggers predate schema-qualified bodies. Keep their lookup
  -- safe and local to this transaction while this SECURITY DEFINER RPC writes.
  perform set_config('search_path', 'public,pg_temp', true);
  select * into v_customer from public.customers where id = p_customer for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_customer.active then raise exception 'CUSTOMER_ALREADY_CLOSED' using errcode = 'P0001'; end if;
  if p_date is null or p_date < v_customer.opening_date or p_date > public.farm_today()
     or nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'CLOSURE_INVALID' using errcode = 'P0001';
  end if;
  select round(
    v_customer.opening_balance
    + coalesce((select sum(amount) from public.milk_deliveries where customer_id = p_customer), 0)
    + coalesce((select sum(amount) from public.company_bills where customer_id = p_customer), 0)
    - coalesce((select sum(case when kind = 'refund' then -amount else amount end) from public.payments where customer_id = p_customer), 0), 2)
  into v_balance;
  v_amount := abs(v_balance);
  if (v_balance > 0 and p_action not in ('payment', 'discount'))
     or (v_balance < 0 and p_action <> 'refund')
     or (v_balance = 0 and p_action <> 'zero') then
    raise exception 'CLOSURE_ACTION_INVALID' using errcode = 'P0001';
  end if;
  if p_action = 'zero' then
    if p_method is not null or p_account is not null then raise exception 'CLOSURE_ACTION_INVALID' using errcode = 'P0001'; end if;
  elsif p_action = 'discount' then
    if p_method is not null or p_account is not null then raise exception 'CLOSURE_ACTION_INVALID' using errcode = 'P0001'; end if;
  else
    if p_method not in ('cash', 'bank', 'easypaisa', 'jazzcash', 'cheque') or p_account is null then
      raise exception 'CLOSURE_ACCOUNT_REQUIRED' using errcode = 'P0001';
    end if;
    select opening_date into v_account_opening from public.accounts where id = p_account and active;
    if v_account_opening is null or p_date < v_account_opening then
      raise exception 'CLOSURE_ACCOUNT_REQUIRED' using errcode = 'P0001';
    end if;
    insert into public.payments(customer_id, payment_date, amount, kind, method, account_id, note)
      values (p_customer, p_date, v_amount, p_action, p_method, p_account,
        'Final Khata settlement: ' || btrim(p_reason)) returning id into v_payment_id;
  end if;
  if p_action = 'discount' then
    insert into public.payments(customer_id, payment_date, amount, kind, method, account_id, note)
      values (p_customer, p_date, v_amount, 'discount', null, null,
        'Final Khata settlement: ' || btrim(p_reason)) returning id into v_payment_id;
  end if;
  perform set_config('app.customer_finalizing', 'on', true);
  update public.customers set active = false where id = p_customer;
  insert into public.customer_closures(customer_id, closed_date, settlement_kind, amount, payment_id, reason, actor_id)
    values (p_customer, p_date, p_action, v_amount, v_payment_id, btrim(p_reason), auth.uid()) returning id into v_closure_id;
  return v_closure_id;
end $$;

create or replace function public.reopen_customer_khata(p_customer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers%rowtype;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  select * into v_customer from public.customers where id = p_customer for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_customer.active then return; end if;
  perform set_config('app.customer_reopening', 'on', true);
  update public.customers set active = true where id = p_customer;
  update public.customer_closures set reopened_at = now()
    where id = (select id from public.customer_closures where customer_id = p_customer and reopened_at is null order by created_at desc limit 1);
end $$;

create or replace function public.customer_closure_history(p_customer uuid)
returns table (id uuid, closed_date date, settlement_kind text, amount numeric, reason text, payment_id uuid, reopened_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, closed_date, settlement_kind, amount, reason, payment_id, reopened_at
  from public.customer_closures
  where customer_id = p_customer and (private.is_app_owner() or private.demo_access_enabled())
  order by created_at desc
$$;

-- Refunds increase the customer's balance and move money out of Galla. All
-- reports deliberately use the signed credit rather than treating a refund as
-- a discount or a new sale.
drop function public.customer_month_report(date);
create function public.customer_month_report(p_month date)
returns table (
  customer_id uuid, name text, kind text, free_reason text, sort_order int, active boolean,
  litres numeric, amount numeric, previous_balance numeric, total numeric,
  paid numeric, discount numeric, refund numeric, balance numeric)
language sql stable set search_path = public, pg_temp as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  ), d as (
    select customer_id, sum(litres) filter (where delivery_date >= b.m_start and delivery_date < b.m_end) as litres_m,
      sum(amount) filter (where delivery_date >= b.m_start and delivery_date < b.m_end) as amount_m,
      sum(amount) filter (where delivery_date < b.m_start) as amount_before from milk_deliveries, b group by customer_id
  ), cb as (
    select customer_id, sum(amount) filter (where to_date >= b.m_start and to_date < b.m_end) as amount_m,
      sum(amount) filter (where to_date < b.m_start) as amount_before from company_bills, b group by customer_id
  ), p as (
    select customer_id,
      sum(amount) filter (where kind = 'payment' and payment_date >= b.m_start and payment_date < b.m_end) as paid_m,
      sum(amount) filter (where kind = 'discount' and payment_date >= b.m_start and payment_date < b.m_end) as disc_m,
      sum(amount) filter (where kind = 'refund' and payment_date >= b.m_start and payment_date < b.m_end) as refund_m,
      sum(case when kind = 'refund' then -amount else amount end) filter (where payment_date < b.m_start) as credit_before
    from payments, b group by customer_id
  ), r as (
    select c.id, c.name, c.kind, c.free_reason, c.sort_order, c.active,
      coalesce(d.litres_m, 0) as litres, coalesce(d.amount_m, 0) + coalesce(cb.amount_m, 0) as amount,
      case when c.opening_date < b.m_end then c.opening_balance else 0 end + coalesce(d.amount_before, 0) + coalesce(cb.amount_before, 0) - coalesce(p.credit_before, 0) as previous_balance,
      coalesce(p.paid_m, 0) as paid, coalesce(p.disc_m, 0) as discount, coalesce(p.refund_m, 0) as refund
    from customers c cross join b left join d on d.customer_id = c.id left join cb on cb.customer_id = c.id left join p on p.customer_id = c.id
  )
  select id, name, kind, free_reason, sort_order, active, litres, amount, previous_balance, previous_balance + amount,
    paid, discount, refund, previous_balance + amount - paid - discount + refund
  from r where active or litres <> 0 or amount <> 0 or paid <> 0 or discount <> 0 or refund <> 0 or previous_balance <> 0
  order by case kind when 'regular' then 1 when 'cash' then 2 when 'contractor' then 3 when 'company' then 4 else 5 end, sort_order, name
$$;

create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id, c.name, c.kind,
  c.opening_balance + coalesce((select sum(amount) from public.milk_deliveries d where d.customer_id = c.id), 0)
  + coalesce((select sum(amount) from public.company_bills b where b.customer_id = c.id), 0)
  - coalesce((select sum(case when kind = 'refund' then -amount else amount end) from public.payments p where p.customer_id = c.id), 0) as balance,
  (select max(payment_date) from public.payments p where p.customer_id = c.id and p.kind = 'payment') as last_payment_date
from public.customers c;

create or replace function public.account_entries(p_account uuid)
returns table (entry_date date, entry_kind text, description text, money_in numeric, money_out numeric, ref_id uuid)
language sql stable set search_path = public, pg_temp as $$
  select p.payment_date, 'payment', 'Wusooli: ' || c.name, p.amount, 0::numeric, p.id
    from payments p join customers c on c.id = p.customer_id where p.account_id = p_account and p.kind = 'payment'
  union all
  select p.payment_date, 'refund', 'Customer advance wapas: ' || c.name, 0::numeric, p.amount, p.id
    from payments p join customers c on c.id = p.customer_id where p.account_id = p_account and p.kind = 'refund'
  union all
  select o.income_date, 'other_income', case o.kind when 'animal_sale' then 'Janwar farokht' when 'manure' then 'Gobar' else 'Doosri aamdan' end || coalesce(': ' || o.note, ''), o.amount, 0, o.id from other_income o where o.account_id = p_account
  union all select t.transfer_date, 'transfer_in', 'Mila: ' || a.name || coalesce(' (' || t.note || ')', ''), t.amount, 0, t.id from transfers t join accounts a on a.id = t.from_account_id where t.to_account_id = p_account
  union all select t.transfer_date, 'transfer_out', 'Diya: ' || a.name || coalesce(' (' || t.note || ')', ''), 0, t.amount, t.id from transfers t join accounts a on a.id = t.to_account_id where t.from_account_id = p_account
  union all select e.expense_date, 'expense', 'Kharcha: ' || ec.name || coalesce(' (' || e.note || ')', ''), 0, e.amount, e.id from expenses e join expense_categories ec on ec.id = e.category_id where e.account_id = p_account
$$;

create or replace function public.report_period_summary(p_from date, p_to date)
returns table (produced numeric, delivered numeric, sold_litres numeric, free_litres numeric, milk_income numeric, cash_collected numeric, other_income numeric, farm_expenses numeric, home_expenses numeric, profit numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with milk as (
    select coalesce((select sum(total_litres) from milk_shifts where milk_date between p_from and p_to), 0) as produced,
      coalesce(sum(d.litres), 0) as delivered, coalesce(sum(d.litres) filter (where c.kind <> 'free'), 0) as sold_litres,
      coalesce(sum(d.litres) filter (where c.kind = 'free'), 0) as free_litres, coalesce(sum(d.amount), 0) as delivery_income
    from milk_deliveries d join customers c on c.id = d.customer_id where d.delivery_date between p_from and p_to
  ), company as (select coalesce(sum(amount), 0) as income from company_bills where to_date between p_from and p_to),
  collections as (select coalesce(sum(case when kind = 'refund' then -amount else amount end) filter (where kind in ('payment', 'refund')), 0) as amount from payments where payment_date between p_from and p_to),
  income as (select coalesce(sum(amount), 0) as amount from other_income where income_date between p_from and p_to),
  costs as (select coalesce(sum(e.amount) filter (where ec.is_farm_cost), 0) as farm, coalesce(sum(e.amount) filter (where not ec.is_farm_cost), 0) as home from expenses e join expense_categories ec on ec.id = e.category_id where e.expense_date between p_from and p_to)
  select milk.produced, milk.delivered, milk.sold_litres, milk.free_litres, milk.delivery_income + company.income, collections.amount, income.amount, costs.farm, costs.home, milk.delivery_income + company.income + income.amount - costs.farm from milk, company, collections, income, costs;
end $$;

-- The customer report gains a refund column, so PostgreSQL requires a
-- forward drop/recreate instead of CREATE OR REPLACE.
drop function public.report_period_customers(date, date);
create or replace function public.report_period_customers(p_from date, p_to date)
returns table (customer_id uuid, name text, kind text, sort_order int, litres numeric, charged numeric, paid numeric, discount numeric, refund numeric, period_balance_change numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query with d as (select md.customer_id, coalesce(sum(md.litres), 0) as litres, coalesce(sum(md.amount), 0) as charged from milk_deliveries md where md.delivery_date between p_from and p_to group by md.customer_id),
  b as (select cb.customer_id, coalesce(sum(cb.amount), 0) as charged from company_bills cb where cb.to_date between p_from and p_to group by cb.customer_id),
  p as (select pay.customer_id, coalesce(sum(pay.amount) filter (where pay.kind = 'payment'), 0) as paid, coalesce(sum(pay.amount) filter (where pay.kind = 'discount'), 0) as discount, coalesce(sum(pay.amount) filter (where pay.kind = 'refund'), 0) as refund from payments pay where pay.payment_date between p_from and p_to group by pay.customer_id)
  select c.id, c.name, c.kind, c.sort_order, coalesce(d.litres, 0), coalesce(d.charged, 0) + coalesce(b.charged, 0), coalesce(p.paid, 0), coalesce(p.discount, 0), coalesce(p.refund, 0), coalesce(d.charged, 0) + coalesce(b.charged, 0) - coalesce(p.paid, 0) - coalesce(p.discount, 0) + coalesce(p.refund, 0)
  from customers c left join d on d.customer_id = c.id left join b on b.customer_id = c.id left join p on p.customer_id = c.id
  where c.opening_date <= p_to and (c.active or coalesce(d.litres, 0) <> 0 or coalesce(d.charged, 0) <> 0 or coalesce(b.charged, 0) <> 0 or coalesce(p.paid, 0) <> 0 or coalesce(p.discount, 0) <> 0 or coalesce(p.refund, 0) <> 0)
  order by c.sort_order, c.name, c.id;
end $$;

create or replace function public.customer_period_ledger(p_customer uuid, p_from date, p_to date)
returns table (entry_date date, entry_kind text, detail text, litres numeric, charge numeric, credit numeric, reference_id uuid)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  select d.delivery_date, 'delivery', case d.shift when 'morning' then 'Subah doodh' when 'noon' then 'Dopehr doodh' else 'Shaam doodh' end, d.litres, d.amount, 0::numeric, d.id from milk_deliveries d where d.customer_id = p_customer and d.delivery_date between p_from and p_to
  union all select b.to_date, 'company_bill', 'Company parchi (' || b.from_date || ' - ' || b.to_date || ')', b.litres, b.amount, 0::numeric, b.id from company_bills b where b.customer_id = p_customer and b.to_date between p_from and p_to
  union all select p.payment_date, p.kind, case p.kind when 'discount' then 'Riayat' when 'refund' then 'Customer advance wapas' else 'Wusooli' end, null::numeric, 0::numeric, case when p.kind = 'refund' then -p.amount else p.amount end, p.id from payments p where p.customer_id = p_customer and p.payment_date between p_from and p_to
  order by 1, 2, 7;
end $$;

revoke all on function public.finalize_customer_khata(uuid,text,date,text,uuid,text), public.reopen_customer_khata(uuid), public.customer_closure_history(uuid) from public, anon, authenticated;
grant execute on function public.finalize_customer_khata(uuid,text,date,text,uuid,text), public.reopen_customer_khata(uuid), public.customer_closure_history(uuid) to authenticated;
revoke all on function public.customer_month_report(date), public.account_entries(uuid), public.report_period_summary(date,date), public.report_period_customers(date,date), public.customer_period_ledger(uuid,date,date) from public, anon, authenticated;
grant execute on function public.customer_month_report(date), public.account_entries(uuid), public.report_period_summary(date,date), public.report_period_customers(date,date), public.customer_period_ledger(uuid,date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.finalize_customer_khata(uuid,text,date,text,uuid,text), public.reopen_customer_khata(uuid), public.customer_closure_history(uuid), public.customer_month_report(date), public.account_entries(uuid), public.report_period_summary(date,date), public.report_period_customers(date,date), public.customer_period_ledger(uuid,date,date) to anon;
  end if;
end $$;
