-- Keep the consolidated report's monetary totals in PostgreSQL numeric.
-- These read-only wrappers reuse the existing Khata and cashflow sources.
create function public.final_report_khata(p_from date, p_to date)
returns table (
  is_grand_total boolean, customer_id uuid, name text, sort_order integer,
  litres numeric, opening_balance numeric, opening_added numeric,
  charges numeric, total_payable numeric, payments numeric,
  discounts numeric, refunds numeric, closing_balance numeric,
  receivables_due numeric, customer_credits numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  return query
  with customers as (
    select k.customer_id, k.name, k.sort_order, k.litres, k.opening_balance, k.opening_added,
      k.charges,
      k.opening_balance + k.opening_added + k.charges - k.discounts + k.refunds as total_payable,
      k.payments, k.discounts, k.refunds, k.closing_balance,
      greatest(k.closing_balance, 0) as receivables_due,
      greatest(-k.closing_balance, 0) as customer_credits
    from public.khata_period_summary(p_from, p_to) k
  )
  select * from (
    select false as is_grand_total, c.customer_id, c.name, c.sort_order,
      c.litres, c.opening_balance, c.opening_added, c.charges, c.total_payable,
      c.payments, c.discounts, c.refunds, c.closing_balance,
      c.receivables_due, c.customer_credits
    from customers c
    union all
    select true, null::uuid, 'Grand total', 2147483647,
      coalesce(sum(c.litres), 0), coalesce(sum(c.opening_balance), 0),
      coalesce(sum(c.opening_added), 0), coalesce(sum(c.charges), 0),
      coalesce(sum(c.total_payable), 0), coalesce(sum(c.payments), 0),
      coalesce(sum(c.discounts), 0), coalesce(sum(c.refunds), 0),
      coalesce(sum(c.closing_balance), 0), coalesce(sum(c.receivables_due), 0),
      coalesce(sum(c.customer_credits), 0)
    from customers c
  ) report_rows
  order by report_rows.is_grand_total, report_rows.sort_order, report_rows.name;
end $$;

create function public.final_report_cash_position(p_from date, p_to date)
returns table (closing_cash_bank_balance numeric, cash_bank_account_count integer)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  return query
  select case when count(*) = 0 then null::numeric else sum(f.closing_balance) end,
    count(*)::integer
  from public.financial_report_cashflow(p_from, p_to) f
  where f.account_kind in ('cash', 'bank');
end $$;

create function public.final_report_expense_categories(p_from date, p_to date)
returns table (category text, is_farm_cost boolean, entries bigint, amount numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if p_to > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  return query
  select c.name, c.is_farm_cost, count(*)::bigint, sum(e.amount)
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  where e.expense_date between p_from and p_to
  group by c.id, c.name, c.is_farm_cost
  order by c.is_farm_cost desc, sum(e.amount) desc, c.name;
end $$;

revoke all on function public.final_report_khata(date, date),
  public.final_report_cash_position(date, date),
  public.final_report_expense_categories(date, date) from public, anon, authenticated;
grant execute on function public.final_report_khata(date, date),
  public.final_report_cash_position(date, date),
  public.final_report_expense_categories(date, date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.final_report_khata(date, date),
      public.final_report_cash_position(date, date),
      public.final_report_expense_categories(date, date) to anon;
  end if;
end $$;
