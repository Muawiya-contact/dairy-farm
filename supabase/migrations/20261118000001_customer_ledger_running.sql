-- One database-side source of truth for a customer's opening, running and
-- closing balances. Do not calculate these from only the visible rows.
drop function public.customer_period_ledger(uuid, date, date);

create function public.customer_period_ledger(p_customer uuid, p_from date, p_to date)
returns table (
  entry_date date, entry_kind text, detail text, litres numeric,
  charge numeric, credit numeric, payment numeric, discount numeric, refund numeric,
  running_balance numeric, reference_id uuid
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  with all_lines as (
    select d.delivery_date as entry_date, 'delivery'::text as entry_kind,
      case d.shift when 'morning' then 'Subah doodh' when 'noon' then 'Dopehr doodh' else 'Shaam doodh' end as detail,
      d.litres, d.amount as charge, 0::numeric as payment, 0::numeric as discount, 0::numeric as refund, 1 as sort_order, d.id as reference_id
    from milk_deliveries d where d.customer_id = p_customer
    union all
    select b.to_date, 'company_bill', 'Company parchi (' || b.from_date || ' - ' || b.to_date || ')',
      b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric, 2, b.id
    from company_bills b where b.customer_id = p_customer
    union all
    select p.payment_date, p.kind,
      case p.kind when 'discount' then 'Riayat' when 'refund' then 'Customer advance wapas' else 'Wusooli' end,
      null::numeric, 0::numeric,
      case when p.kind = 'payment' then p.amount else 0::numeric end,
      case when p.kind = 'discount' then p.amount else 0::numeric end,
      case when p.kind = 'refund' then p.amount else 0::numeric end,
      case p.kind when 'payment' then 3 when 'discount' then 4 else 5 end, p.id
    from payments p where p.customer_id = p_customer
  ), opening as (
    select c.opening_balance + coalesce(sum(l.charge - l.payment - l.discount + l.refund) filter (where l.entry_date < p_from), 0) as balance
    from customers c left join all_lines l on true where c.id = p_customer group by c.opening_balance
  ), selected as (
    select * from all_lines where all_lines.entry_date between p_from and p_to
  )
  select l.entry_date, l.entry_kind, l.detail, l.litres, l.charge,
    l.payment + l.discount - l.refund as credit, l.payment, l.discount, l.refund,
    o.balance + sum(l.charge - l.payment - l.discount + l.refund) over (order by l.entry_date, l.sort_order, l.reference_id) as running_balance,
    l.reference_id
  from selected l cross join opening o
  order by l.entry_date, l.sort_order, l.reference_id;
end $$;

create function public.customer_period_ledger_summary(p_customer uuid, p_from date, p_to date)
returns table (
  opening_balance numeric, litres numeric, charges numeric, payments numeric,
  discounts numeric, refunds numeric, closing_balance numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if not exists (select 1 from customers where id = p_customer) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  return query
  with all_lines as (
    select d.delivery_date as entry_date, d.litres, d.amount as charge, 0::numeric as payment, 0::numeric as discount, 0::numeric as refund from milk_deliveries d where d.customer_id = p_customer
    union all select b.to_date, b.litres, b.amount, 0::numeric, 0::numeric, 0::numeric from company_bills b where b.customer_id = p_customer
    union all select p.payment_date, null::numeric, 0::numeric,
      case when p.kind = 'payment' then p.amount else 0::numeric end,
      case when p.kind = 'discount' then p.amount else 0::numeric end,
      case when p.kind = 'refund' then p.amount else 0::numeric end from payments p where p.customer_id = p_customer
  ), totals as (
    select c.opening_balance + coalesce(sum(l.charge - l.payment - l.discount + l.refund) filter (where l.entry_date < p_from), 0) as opening_balance,
      coalesce(sum(l.litres) filter (where l.entry_date between p_from and p_to), 0) as litres,
      coalesce(sum(l.charge) filter (where l.entry_date between p_from and p_to), 0) as charges,
      coalesce(sum(l.payment) filter (where l.entry_date between p_from and p_to), 0) as payments,
      coalesce(sum(l.discount) filter (where l.entry_date between p_from and p_to), 0) as discounts,
      coalesce(sum(l.refund) filter (where l.entry_date between p_from and p_to), 0) as refunds
    from customers c left join all_lines l on true where c.id = p_customer group by c.opening_balance
  )
  select t.opening_balance, t.litres, t.charges, t.payments, t.discounts, t.refunds,
    t.opening_balance + t.charges - t.payments - t.discounts + t.refunds
  from totals t;
end $$;

revoke all on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) from public, anon, authenticated;
grant execute on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.customer_period_ledger(uuid,date,date), public.customer_period_ledger_summary(uuid,date,date) to anon;
  end if;
end $$;
