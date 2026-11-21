-- Financial summaries reuse the existing income, expense, Khata, and Galla
-- ledgers. These read-only functions provide the period cash and salary views
-- that were not exposed by the earlier report RPCs.
create function public.financial_report_cashflow(p_from date, p_to date)
returns table (
  account_id uuid, account_name text, account_kind text,
  opening_balance numeric, money_received numeric, money_paid numeric,
  transfers_in numeric, transfers_out numeric, closing_balance numeric,
  opening_date date, opening_amount numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if p_to > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;

  return query
  with balances as (
    select a.id, a.name, a.kind, a.active, a.opening_date, a.opening_balance,
      case when p_from = date '0001-01-01' then 0::numeric
        else public.account_balance_on(a.id, p_from - 1) end as opening,
      coalesce(m.received, 0) + case when a.opening_date between p_from and p_to
        then greatest(a.opening_balance, 0) else 0 end as received,
      coalesce(m.paid, 0) + case when a.opening_date between p_from and p_to
        then greatest(-a.opening_balance, 0) else 0 end as paid,
      coalesce(m.transfers_in, 0) as transfers_in,
      coalesce(m.transfers_out, 0) as transfers_out,
      public.account_balance_on(a.id, p_to) as closing
    from public.accounts a
    left join lateral (
      select
        coalesce(sum(e.money_in) filter (where e.entry_kind <> 'transfer_in'), 0) as received,
        coalesce(sum(e.money_out) filter (where e.entry_kind <> 'transfer_out'), 0) as paid,
        coalesce(sum(e.money_in) filter (where e.entry_kind = 'transfer_in'), 0) as transfers_in,
        coalesce(sum(e.money_out) filter (where e.entry_kind = 'transfer_out'), 0) as transfers_out
      from public.account_entries(a.id) e
      where e.entry_date between p_from and p_to
    ) m on true
  )
  select b.id, b.name, b.kind, b.opening, b.received, b.paid,
    b.transfers_in, b.transfers_out, b.closing, b.opening_date,
    case when b.opening_date between p_from and p_to then b.opening_balance else 0::numeric end
  from balances b
  where b.active or b.opening <> 0 or b.received <> 0 or b.paid <> 0
    or b.transfers_in <> 0 or b.transfers_out <> 0 or b.closing <> 0
  order by b.name, b.id;
end $$;

create function public.financial_report_salary_payables(p_as_of date)
returns table (
  staff_id uuid, staff_name text, salary_month date,
  agreed_amount numeric, paid_amount numeric, outstanding_amount numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_as_of is null or p_as_of > public.farm_today() then
    raise exception 'REPORT_PERIOD_INVALID';
  end if;
  return query
  select p.staff_id, s.name, p.salary_month, p.agreed_amount,
    coalesce(sum(e.amount), 0), p.agreed_amount - coalesce(sum(e.amount), 0)
  from public.salary_periods p
  join public.staff s on s.id = p.staff_id
  left join public.expenses e on e.salary_period_id = p.id and e.expense_date <= p_as_of
  where p.salary_month <= date_trunc('month', p_as_of)::date
  group by p.staff_id, s.name, p.salary_month, p.agreed_amount
  order by p.salary_month, s.name, p.staff_id;
end $$;

create function public.financial_report_income_rows(
  p_from date, p_to date, p_limit integer default 100, p_offset integer default 0
)
returns table (
  income_id uuid, income_date date, kind text, amount numeric, note text, animal_tag text
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from, p_to);
  if p_to > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  if p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset < 0 then
    raise exception 'FINANCIAL_REPORT_PAGE_INVALID';
  end if;
  return query
  select i.id, i.income_date, i.kind, i.amount, i.note, a.tag
  from public.other_income i
  left join public.animals a on a.id = i.animal_id
  where i.income_date between p_from and p_to
  order by i.income_date, i.id
  limit p_limit offset p_offset;
end $$;

create function public.financial_report_trends(p_from date, p_to date)
returns table (
  bucket_start date, milk_income numeric, other_income numeric,
  customer_collections numeric, farm_expenses numeric, home_expenses numeric,
  total_income numeric, net_profit numeric, cash_received numeric, cash_paid numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_bucket text;
begin
  perform public.assert_report_period(p_from, p_to);
  if p_to > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  v_bucket := case when p_to - p_from < 90 then 'day' else 'month' end;

  return query
  with buckets as (
    select generated::date as bucket_start
    from generate_series(
      date_trunc(v_bucket, p_from::timestamp), date_trunc(v_bucket, p_to::timestamp),
      case when v_bucket = 'day' then interval '1 day' else interval '1 month' end
    ) generated
  ), milk as (
    select date_trunc(v_bucket, d.delivery_date::timestamp)::date as bucket_start,
      coalesce(sum(d.amount), 0) as amount
    from public.milk_deliveries d
    where d.delivery_date between p_from and p_to
    group by 1
  ), company as (
    select date_trunc(v_bucket, b.to_date::timestamp)::date as bucket_start,
      coalesce(sum(b.amount), 0) as amount
    from public.company_bills b
    where b.to_date between p_from and p_to
    group by 1
  ), other as (
    select date_trunc(v_bucket, i.income_date::timestamp)::date as bucket_start,
      coalesce(sum(i.amount), 0) as amount
    from public.other_income i
    where i.income_date between p_from and p_to
    group by 1
  ), collections as (
    select date_trunc(v_bucket, p.payment_date::timestamp)::date as bucket_start,
      coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0) as amount
    from public.payments p
    where p.payment_date between p_from and p_to and p.kind in ('payment', 'refund')
    group by 1
  ), costs as (
    select date_trunc(v_bucket, e.expense_date::timestamp)::date as bucket_start,
      coalesce(sum(e.amount) filter (where c.is_farm_cost), 0) as farm,
      coalesce(sum(e.amount) filter (where not c.is_farm_cost), 0) as home
    from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    where e.expense_date between p_from and p_to
    group by 1
  ), cash_rows as (
    select e.entry_date as movement_date, e.money_in, e.money_out
    from public.accounts a
    cross join lateral public.account_entries(a.id) e
    where e.entry_date between p_from and p_to
      and e.entry_kind not in ('transfer_in', 'transfer_out')
    union all
    select a.opening_date, greatest(a.opening_balance, 0), greatest(-a.opening_balance, 0)
    from public.accounts a
    where a.opening_date between p_from and p_to
  ), cash as (
    select date_trunc(v_bucket, c.movement_date::timestamp)::date as bucket_start,
      coalesce(sum(c.money_in), 0) as received, coalesce(sum(c.money_out), 0) as paid
    from cash_rows c
    group by 1
  )
  select b.bucket_start, coalesce(m.amount, 0) + coalesce(co.amount, 0),
    coalesce(o.amount, 0), coalesce(cl.amount, 0), coalesce(cs.farm, 0), coalesce(cs.home, 0),
    coalesce(m.amount, 0) + coalesce(co.amount, 0) + coalesce(o.amount, 0),
    coalesce(m.amount, 0) + coalesce(co.amount, 0) + coalesce(o.amount, 0) - coalesce(cs.farm, 0),
    coalesce(c.received, 0), coalesce(c.paid, 0)
  from buckets b
  left join milk m on m.bucket_start = b.bucket_start
  left join company co on co.bucket_start = b.bucket_start
  left join other o on o.bucket_start = b.bucket_start
  left join collections cl on cl.bucket_start = b.bucket_start
  left join costs cs on cs.bucket_start = b.bucket_start
  left join cash c on c.bucket_start = b.bucket_start
  order by b.bucket_start;
end $$;

revoke all on function public.financial_report_cashflow(date,date),
  public.financial_report_salary_payables(date),
  public.financial_report_income_rows(date,date,integer,integer),
  public.financial_report_trends(date,date) from public, anon, authenticated;
grant execute on function public.financial_report_cashflow(date,date),
  public.financial_report_salary_payables(date),
  public.financial_report_income_rows(date,date,integer,integer),
  public.financial_report_trends(date,date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.financial_report_cashflow(date,date),
      public.financial_report_salary_payables(date),
      public.financial_report_income_rows(date,date,integer,integer),
      public.financial_report_trends(date,date) to anon;
  end if;
end $$;
