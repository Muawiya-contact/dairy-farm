-- Qualify CTE fields because RETURNS TABLE output names are PL/pgSQL variables too.
-- This forward-only correction keeps deployed migration history intact.
create or replace function public.report_period_customers(p_from date, p_to date)
returns table (
  customer_id uuid, name text, kind text, sort_order int, litres numeric,
  charged numeric, paid numeric, discount numeric, period_balance_change numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  return query
  with deliveries as (
    select md.customer_id, coalesce(sum(md.litres), 0) as litres, coalesce(sum(md.amount), 0) as charged
    from milk_deliveries md where md.delivery_date between p_from and p_to group by md.customer_id
  ), bills as (
    select cb.customer_id, coalesce(sum(cb.amount), 0) as charged
    from company_bills cb where cb.to_date between p_from and p_to group by cb.customer_id
  ), payments_by_customer as (
    select p.customer_id,
      coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0) as paid,
      coalesce(sum(p.amount) filter (where p.kind = 'discount'), 0) as discount
    from payments p where p.payment_date between p_from and p_to group by p.customer_id
  )
  select c.id, c.name, c.kind, c.sort_order,
    coalesce(d.litres, 0), coalesce(d.charged, 0) + coalesce(b.charged, 0),
    coalesce(p.paid, 0), coalesce(p.discount, 0),
    coalesce(d.charged, 0) + coalesce(b.charged, 0) - coalesce(p.paid, 0) - coalesce(p.discount, 0)
  from customers c
  left join deliveries d on d.customer_id = c.id
  left join bills b on b.customer_id = c.id
  left join payments_by_customer p on p.customer_id = c.id
  where c.opening_date <= p_to and (c.active or coalesce(d.litres, 0) <> 0 or coalesce(d.charged, 0) <> 0
    or coalesce(b.charged, 0) <> 0 or coalesce(p.paid, 0) <> 0 or coalesce(p.discount, 0) <> 0)
  order by c.sort_order, c.name, c.id;
end $$;

revoke all on function public.report_period_customers(date,date) from public, anon, authenticated;
grant execute on function public.report_period_customers(date,date) to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.report_period_customers(date,date) to anon;
  end if;
end $$;
