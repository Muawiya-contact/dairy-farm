-- Existing customers may already owe the farm or have an advance before this
-- app's recorded activity. Keep those corrections as dated, auditable Khata
-- movements instead of rewriting their locked opening balance or inventing a
-- cash receipt.
create table public.customer_balance_adjustments (
  id uuid primary key,
  customer_id uuid not null references public.customers(id) on delete restrict,
  adjustment_date date not null,
  balance_change numeric(12,2) not null check (balance_change <> 0),
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  actor_id uuid
);
create index customer_balance_adjustments_customer_date_idx
  on public.customer_balance_adjustments(customer_id, adjustment_date, id);
alter table public.customer_balance_adjustments enable row level security;
create policy customer_balance_adjustments_owner_read on public.customer_balance_adjustments
  for select to authenticated using ((select private.is_app_owner()));
create policy customer_balance_adjustments_demo_read on public.customer_balance_adjustments
  for select to anon using ((select private.demo_access_enabled()));
revoke all on public.customer_balance_adjustments from public, anon, authenticated;
grant select on public.customer_balance_adjustments to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.customer_balance_adjustments to anon;
  end if;
end $$;

create trigger subscription_write_guard
  before insert or update or delete on public.customer_balance_adjustments
  for each row execute function private.guard_subscription_write();
create trigger customer_balance_adjustment_month_lock
  before insert or update or delete on public.customer_balance_adjustments
  for each row execute function public.trg_month_lock('adjustment_date');

create function public.trg_customer_balance_adjustment_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_APPEND_ONLY: correction ke liye ulta naya Khata adjustment darj karein'
    using errcode = 'P0001';
end $$;
revoke all on function public.trg_customer_balance_adjustment_append_only() from public, anon, authenticated;
create trigger customer_balance_adjustment_append_only
  before update or delete on public.customer_balance_adjustments
  for each row execute function public.trg_customer_balance_adjustment_append_only();

create function public.record_customer_balance_adjustment(
  p_id uuid, p_customer uuid, p_date date, p_balance_change numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers%rowtype; v_existing public.customer_balance_adjustments%rowtype;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_id is null or p_customer is null or p_date is null
     or p_balance_change is null or p_balance_change = 0
     or abs(p_balance_change) > 9999999999.99 or p_balance_change <> round(p_balance_change, 2)
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_INVALID: tareekh, raqam aur wajah check karein' using errcode = 'P0001';
  end if;

  select * into v_existing from public.customer_balance_adjustments where id = p_id;
  if found then
    if v_existing.customer_id = p_customer and v_existing.adjustment_date = p_date
       and v_existing.balance_change = p_balance_change and v_existing.reason = trim(p_reason) then
      return p_id;
    end if;
    raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_ID_REUSED' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = p_customer for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_customer.active then raise exception 'CUSTOMER_ALREADY_CLOSED' using errcode = 'P0001'; end if;
  if v_customer.kind not in ('regular', 'cash', 'contractor', 'company') then
    raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_KIND_INVALID' using errcode = 'P0001';
  end if;
  if p_date < v_customer.opening_date or p_date > public.farm_today() then
    raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_DATE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.customer_balance_adjustments(id, customer_id, adjustment_date, balance_change, reason, actor_id)
    values (p_id, p_customer, p_date, p_balance_change, trim(p_reason), auth.uid())
    on conflict (id) do nothing;
  if not found then
    select * into v_existing from public.customer_balance_adjustments where id = p_id;
    if v_existing.customer_id = p_customer and v_existing.adjustment_date = p_date
       and v_existing.balance_change = p_balance_change and v_existing.reason = trim(p_reason) then
      return p_id;
    end if;
    raise exception 'CUSTOMER_BALANCE_ADJUSTMENT_ID_REUSED' using errcode = 'P0001';
  end if;
  return p_id;
end $$;
revoke all on function public.record_customer_balance_adjustment(uuid,uuid,date,numeric,text) from public, anon, authenticated;
grant execute on function public.record_customer_balance_adjustment(uuid,uuid,date,numeric,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.record_customer_balance_adjustment(uuid,uuid,date,numeric,text) to anon;
  end if;
end $$;

-- Final settlement uses the exact same balance equation as the live view,
-- including historical Khata corrections.
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
    - coalesce((select sum(case when kind = 'refund' then -amount else amount end) from public.payments where customer_id = p_customer), 0)
    + coalesce((select sum(balance_change) from public.customer_balance_adjustments where customer_id = p_customer), 0), 2)
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

drop function public.customer_month_report(date);
create function public.customer_month_report(p_month date)
returns table (
  customer_id uuid, name text, kind text, free_reason text, sort_order int, active boolean,
  litres numeric, amount numeric, previous_balance numeric, total numeric,
  paid numeric, discount numeric, refund numeric, balance numeric, balance_adjustment numeric
)
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
  ), a as (
    select customer_id,
      sum(balance_change) filter (where adjustment_date < b.m_start) as balance_before,
      sum(balance_change) filter (where adjustment_date >= b.m_start and adjustment_date < b.m_end) as balance_m
    from customer_balance_adjustments, b group by customer_id
  ), r as (
    select c.id, c.name, c.kind, c.free_reason, c.sort_order, c.active,
      coalesce(d.litres_m, 0) as litres, coalesce(d.amount_m, 0) + coalesce(cb.amount_m, 0) as amount,
      case when c.opening_date < b.m_end then c.opening_balance else 0 end + coalesce(d.amount_before, 0) + coalesce(cb.amount_before, 0) - coalesce(p.credit_before, 0) + coalesce(a.balance_before, 0) as previous_balance,
      coalesce(p.paid_m, 0) as paid, coalesce(p.disc_m, 0) as discount, coalesce(p.refund_m, 0) as refund,
      coalesce(a.balance_m, 0) as balance_adjustment
    from customers c cross join b left join d on d.customer_id = c.id left join cb on cb.customer_id = c.id
      left join p on p.customer_id = c.id left join a on a.customer_id = c.id
  )
  select id, name, kind, free_reason, sort_order, active, litres, amount, previous_balance,
    previous_balance + amount + balance_adjustment, paid, discount, refund,
    previous_balance + amount + balance_adjustment - paid - discount + refund, balance_adjustment
  from r where active or litres <> 0 or amount <> 0 or paid <> 0 or discount <> 0 or refund <> 0
    or previous_balance <> 0 or balance_adjustment <> 0
  order by case kind when 'regular' then 1 when 'cash' then 2 when 'contractor' then 3 when 'company' then 4 else 5 end, sort_order, name
$$;

create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id, c.name, c.kind,
  c.opening_balance + coalesce((select sum(amount) from public.milk_deliveries d where d.customer_id = c.id), 0)
  + coalesce((select sum(amount) from public.company_bills b where b.customer_id = c.id), 0)
  - coalesce((select sum(case when kind = 'refund' then -amount else amount end) from public.payments p where p.customer_id = c.id), 0)
  + coalesce((select sum(a.balance_change) from public.customer_balance_adjustments a where a.customer_id = c.id), 0) as balance,
  (select max(payment_date) from public.payments p where p.customer_id = c.id and p.kind = 'payment') as last_payment_date
from public.customers c;

drop function public.report_period_customers(date, date);
create function public.report_period_customers(p_from date, p_to date)
returns table (
  customer_id uuid, name text, kind text, sort_order int, litres numeric,
  charged numeric, paid numeric, discount numeric, refund numeric,
  balance_adjustment numeric, period_balance_change numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with d as (
    select md.customer_id, coalesce(sum(md.litres), 0) as litres, coalesce(sum(md.amount), 0) as charged
    from milk_deliveries md where md.delivery_date between p_from and p_to group by md.customer_id
  ), b as (
    select cb.customer_id, coalesce(sum(cb.amount), 0) as charged
    from company_bills cb where cb.to_date between p_from and p_to group by cb.customer_id
  ), p as (
    select pay.customer_id,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment'), 0) as paid,
      coalesce(sum(pay.amount) filter (where pay.kind = 'discount'), 0) as discount,
      coalesce(sum(pay.amount) filter (where pay.kind = 'refund'), 0) as refund
    from payments pay where pay.payment_date between p_from and p_to group by pay.customer_id
  ), a as (
    select ba.customer_id, coalesce(sum(ba.balance_change), 0) as balance_adjustment
    from customer_balance_adjustments ba where ba.adjustment_date between p_from and p_to group by ba.customer_id
  )
  select c.id, c.name, c.kind, c.sort_order, coalesce(d.litres, 0),
    coalesce(d.charged, 0) + coalesce(b.charged, 0), coalesce(p.paid, 0), coalesce(p.discount, 0), coalesce(p.refund, 0),
    coalesce(a.balance_adjustment, 0),
    coalesce(d.charged, 0) + coalesce(b.charged, 0) - coalesce(p.paid, 0) - coalesce(p.discount, 0)
      + coalesce(p.refund, 0) + coalesce(a.balance_adjustment, 0)
  from customers c left join d on d.customer_id = c.id left join b on b.customer_id = c.id
    left join p on p.customer_id = c.id left join a on a.customer_id = c.id
  where c.opening_date <= p_to and (c.active or coalesce(d.litres, 0) <> 0 or coalesce(d.charged, 0) <> 0
    or coalesce(b.charged, 0) <> 0 or coalesce(p.paid, 0) <> 0 or coalesce(p.discount, 0) <> 0
    or coalesce(p.refund, 0) <> 0 or coalesce(a.balance_adjustment, 0) <> 0)
  order by c.sort_order, c.name, c.id;
end $$;
revoke all on function public.customer_month_report(date), public.report_period_customers(date,date) from public, anon, authenticated;
grant execute on function public.customer_month_report(date), public.report_period_customers(date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.customer_month_report(date), public.report_period_customers(date,date) to anon;
  end if;
end $$;

drop function public.customer_period_ledger(uuid, date, date);
create function public.customer_period_ledger(p_customer uuid, p_from date, p_to date)
returns table (
  entry_date date, entry_kind text, detail text, litres numeric,
  charge numeric, credit numeric, payment numeric, discount numeric, refund numeric,
  balance_adjustment numeric, running_balance numeric, reference_id uuid
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  with all_lines as (
    select d.delivery_date as entry_date, 'delivery'::text as entry_kind,
      case d.shift when 'morning' then 'Subah doodh' when 'noon' then 'Dopehr doodh' else 'Shaam doodh' end as detail,
      d.litres, d.amount as charge, 0::numeric as payment, 0::numeric as discount, 0::numeric as refund,
      0::numeric as balance_adjustment, 1 as sort_order, d.id as reference_id
    from milk_deliveries d where d.customer_id = p_customer
    union all
    select b.to_date, 'company_bill', 'Company parchi (' || b.from_date || ' - ' || b.to_date || ')',
      b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 2, b.id
    from company_bills b where b.customer_id = p_customer
    union all
    select p.payment_date, p.kind,
      case p.kind when 'discount' then 'Riayat' when 'refund' then 'Customer advance wapas' else 'Wusooli' end,
      null::numeric, 0::numeric,
      case when p.kind = 'payment' then p.amount else 0::numeric end,
      case when p.kind = 'discount' then p.amount else 0::numeric end,
      case when p.kind = 'refund' then p.amount else 0::numeric end,
      0::numeric, case p.kind when 'payment' then 3 when 'discount' then 4 else 5 end, p.id
    from payments p where p.customer_id = p_customer
    union all
    select a.adjustment_date, 'balance_adjustment', 'Purana Khata: ' || a.reason,
      null::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
      a.balance_change, 0, a.id
    from customer_balance_adjustments a where a.customer_id = p_customer
  ), opening as (
    select c.opening_balance + coalesce(sum(l.charge - l.payment - l.discount + l.refund + l.balance_adjustment) filter (where l.entry_date < p_from), 0) as balance
    from customers c left join all_lines l on true where c.id = p_customer group by c.opening_balance
  ), selected as (
    select * from all_lines where all_lines.entry_date between p_from and p_to
  )
  select l.entry_date, l.entry_kind, l.detail, l.litres, l.charge,
    l.payment + l.discount - l.refund, l.payment, l.discount, l.refund, l.balance_adjustment,
    o.balance + sum(l.charge - l.payment - l.discount + l.refund + l.balance_adjustment)
      over (order by l.entry_date, l.sort_order, l.reference_id), l.reference_id
  from selected l cross join opening o
  order by l.entry_date, l.sort_order, l.reference_id;
end $$;

drop function public.customer_period_ledger_summary(uuid, date, date);
create function public.customer_period_ledger_summary(p_customer uuid, p_from date, p_to date)
returns table (
  opening_balance numeric, litres numeric, charges numeric, payments numeric,
  discounts numeric, refunds numeric, balance_adjustments numeric, closing_balance numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  with all_lines as (
    select d.delivery_date as entry_date, d.litres, d.amount as charge, 0::numeric as payment,
      0::numeric as discount, 0::numeric as refund, 0::numeric as balance_adjustment
    from milk_deliveries d where d.customer_id = p_customer
    union all select b.to_date, b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric, 0::numeric
      from company_bills b where b.customer_id = p_customer
    union all select p.payment_date, null::numeric, 0::numeric,
      case when p.kind = 'payment' then p.amount else 0::numeric end,
      case when p.kind = 'discount' then p.amount else 0::numeric end,
      case when p.kind = 'refund' then p.amount else 0::numeric end, 0::numeric
      from payments p where p.customer_id = p_customer
    union all select a.adjustment_date, null::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, a.balance_change
      from customer_balance_adjustments a where a.customer_id = p_customer
  ), totals as (
    select c.opening_balance + coalesce(sum(l.charge - l.payment - l.discount + l.refund + l.balance_adjustment) filter (where l.entry_date < p_from), 0) as opening_balance,
      coalesce(sum(l.litres) filter (where l.entry_date between p_from and p_to), 0) as litres,
      coalesce(sum(l.charge) filter (where l.entry_date between p_from and p_to), 0) as charges,
      coalesce(sum(l.payment) filter (where l.entry_date between p_from and p_to), 0) as payments,
      coalesce(sum(l.discount) filter (where l.entry_date between p_from and p_to), 0) as discounts,
      coalesce(sum(l.refund) filter (where l.entry_date between p_from and p_to), 0) as refunds,
      coalesce(sum(l.balance_adjustment) filter (where l.entry_date between p_from and p_to), 0) as balance_adjustments
    from customers c left join all_lines l on true where c.id = p_customer group by c.opening_balance
  )
  select t.opening_balance, t.litres, t.charges, t.payments, t.discounts, t.refunds,
    t.balance_adjustments, t.opening_balance + t.charges - t.payments - t.discounts + t.refunds + t.balance_adjustments
  from totals t;
end $$;
revoke all on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) from public, anon, authenticated;
grant execute on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) to anon;
  end if;
end $$;

drop function public.khata_year_month_summary(int);
drop function public.khata_period_summary(date, date);
create function public.khata_period_summary(p_from date, p_to date)
returns table (
  customer_id uuid, name text, kind text, active boolean, sort_order int,
  litres numeric, charges numeric, payments numeric, discounts numeric, refunds numeric,
  balance_adjustments numeric, opening_balance numeric, opening_added numeric, closing_balance numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with lines as (
    select d.customer_id, d.delivery_date as entry_date, d.litres, d.amount as charge,
      0::numeric as payment, 0::numeric as discount, 0::numeric as refund, 0::numeric as balance_adjustment from milk_deliveries d
    union all select b.customer_id, b.to_date, b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric, 0::numeric from company_bills b
    union all select p.customer_id, p.payment_date, null::numeric, 0::numeric,
      case when p.kind = 'payment' then p.amount else 0::numeric end,
      case when p.kind = 'discount' then p.amount else 0::numeric end,
      case when p.kind = 'refund' then p.amount else 0::numeric end, 0::numeric from payments p
    union all select a.customer_id, a.adjustment_date, null::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, a.balance_change from customer_balance_adjustments a
  ), totals as (
    select c.id as customer_id, c.name, c.kind, c.active, c.sort_order,
      coalesce(sum(l.litres) filter (where l.entry_date between p_from and p_to), 0) as litres,
      coalesce(sum(l.charge) filter (where l.entry_date between p_from and p_to), 0) as charges,
      coalesce(sum(l.payment) filter (where l.entry_date between p_from and p_to), 0) as payments,
      coalesce(sum(l.discount) filter (where l.entry_date between p_from and p_to), 0) as discounts,
      coalesce(sum(l.refund) filter (where l.entry_date between p_from and p_to), 0) as refunds,
      coalesce(sum(l.balance_adjustment) filter (where l.entry_date between p_from and p_to), 0) as balance_adjustments,
      case when c.opening_date < p_from then c.opening_balance else 0::numeric end
        + coalesce(sum(l.charge - l.payment - l.discount + l.refund + l.balance_adjustment) filter (where l.entry_date < p_from), 0) as opening_balance,
      case when c.opening_date between p_from and p_to then c.opening_balance else 0::numeric end as opening_added
    from customers c left join lines l on l.customer_id = c.id where c.opening_date <= p_to
    group by c.id, c.name, c.kind, c.active, c.sort_order, c.opening_date, c.opening_balance
  )
  select t.customer_id, t.name, t.kind, t.active, t.sort_order, t.litres, t.charges, t.payments,
    t.discounts, t.refunds, t.balance_adjustments, t.opening_balance, t.opening_added,
    t.opening_balance + t.opening_added + t.charges - t.payments - t.discounts + t.refunds + t.balance_adjustments
  from totals t
  where t.opening_balance <> 0 or t.opening_added <> 0 or t.litres <> 0 or t.charges <> 0
    or t.payments <> 0 or t.discounts <> 0 or t.refunds <> 0 or t.balance_adjustments <> 0
  order by t.sort_order, t.name, t.customer_id;
end $$;

create function public.khata_year_month_summary(p_year int)
returns table (
  month_start date, litres numeric, charges numeric, payments numeric, discounts numeric,
  refunds numeric, balance_adjustments numeric, closing_balance numeric
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with months as (
    select d::date as month_start, (d + interval '1 month - 1 day')::date as month_end
    from generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') d
    where d::date <= public.farm_today()
  )
  select m.month_start, coalesce(sum(s.litres), 0), coalesce(sum(s.charges), 0),
    coalesce(sum(s.payments), 0), coalesce(sum(s.discounts), 0), coalesce(sum(s.refunds), 0),
    coalesce(sum(s.balance_adjustments), 0), coalesce(sum(s.closing_balance), 0)
  from months m left join lateral public.khata_period_summary(m.month_start, least(m.month_end, public.farm_today())) s on true
  group by m.month_start order by m.month_start
$$;
revoke all on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) from public, anon, authenticated;
grant execute on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.khata_period_summary(date,date), public.khata_year_month_summary(int) to anon;
  end if;
end $$;

drop function public.final_report_khata(date,date);
create function public.final_report_khata(p_from date, p_to date)
returns table (
  is_grand_total boolean, customer_id uuid, name text, sort_order integer,
  litres numeric, opening_balance numeric, opening_added numeric,
  charges numeric, balance_adjustments numeric, total_payable numeric, payments numeric,
  discounts numeric, refunds numeric, closing_balance numeric,
  receivables_due numeric, customer_credits numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  return query
  with customers as (
    select k.customer_id, k.name, k.sort_order, k.litres, k.opening_balance, k.opening_added,
      k.charges, k.balance_adjustments,
      k.opening_balance + k.opening_added + k.charges + k.balance_adjustments - k.discounts + k.refunds as total_payable,
      k.payments, k.discounts, k.refunds, k.closing_balance,
      greatest(k.closing_balance, 0) as receivables_due,
      greatest(-k.closing_balance, 0) as customer_credits
    from public.khata_period_summary(p_from, p_to) k
  )
  select * from (
    select false as is_grand_total, c.customer_id, c.name, c.sort_order,
      c.litres, c.opening_balance, c.opening_added, c.charges, c.balance_adjustments, c.total_payable,
      c.payments, c.discounts, c.refunds, c.closing_balance, c.receivables_due, c.customer_credits
    from customers c
    union all
    select true, null::uuid, 'Grand total', 2147483647,
      coalesce(sum(c.litres), 0), coalesce(sum(c.opening_balance), 0), coalesce(sum(c.opening_added), 0),
      coalesce(sum(c.charges), 0), coalesce(sum(c.balance_adjustments), 0), coalesce(sum(c.total_payable), 0),
      coalesce(sum(c.payments), 0), coalesce(sum(c.discounts), 0), coalesce(sum(c.refunds), 0),
      coalesce(sum(c.closing_balance), 0), coalesce(sum(c.receivables_due), 0), coalesce(sum(c.customer_credits), 0)
    from customers c
  ) report_rows
  order by report_rows.is_grand_total, report_rows.sort_order, report_rows.name;
end $$;
revoke all on function public.final_report_khata(date,date) from public, anon, authenticated;
grant execute on function public.final_report_khata(date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.final_report_khata(date,date) to anon;
  end if;
end $$;
