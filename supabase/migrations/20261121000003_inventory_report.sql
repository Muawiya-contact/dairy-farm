-- Read-only inventory reporting uses the authoritative inventory movement ledger.

create function public.inventory_report_summary(
  p_from date, p_to date, p_item_id uuid default null, p_category_id uuid default null
) returns table (
  item_id uuid, item_name text, category_id uuid, category_name text, stock_unit text,
  active boolean, minimum_stock numeric, opening_stock numeric, opening_entries_in numeric,
  purchases_in numeric, usage_out numeric, adjustment_in numeric, adjustment_out numeric,
  wastage_out numeric, closing_stock numeric,
  purchase_amount numeric, current_stock numeric, current_low_stock boolean, current_out_of_stock boolean
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from > p_to
     or p_to > public.farm_today() or p_to - p_from > 3660 then
    raise exception 'INVENTORY_REPORT_PERIOD_INVALID' using errcode = 'P0001';
  end if;

  return query
  with period as (
    select m.item_id,
      coalesce(sum(m.quantity_delta) filter (where m.movement_date < p_from), 0)::numeric as opening_stock,
      coalesce(sum(m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'opening'
      ), 0)::numeric as opening_entries_in,
      coalesce(sum(m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'purchase'
      ), 0)::numeric as purchases_in,
      coalesce(sum(-m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'usage'
      ), 0)::numeric as usage_out,
      coalesce(sum(m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'adjustment' and m.quantity_delta > 0
      ), 0)::numeric as adjustment_in,
      coalesce(sum(-m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'adjustment'
          and m.quantity_delta < 0
      ), 0)::numeric as adjustment_out,
      coalesce(sum(-m.quantity_delta) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'wastage'
      ), 0)::numeric as wastage_out,
      coalesce(sum(m.quantity_delta), 0)::numeric as closing_stock,
      coalesce(sum(m.total_amount) filter (
        where m.movement_date between p_from and p_to and m.movement_type = 'purchase'
      ), 0)::numeric as purchase_amount
    from public.inventory_movements m
    where m.movement_date <= p_to
    group by m.item_id
  ), current_balances as (
    select * from public.inventory_stock_on(public.farm_today())
  )
  select i.id, i.name, i.category_id, c.name, i.base_unit, i.active, i.minimum_stock,
    coalesce(p.opening_stock, 0), coalesce(p.opening_entries_in, 0), coalesce(p.purchases_in, 0),
    coalesce(p.usage_out, 0), coalesce(p.adjustment_in, 0), coalesce(p.adjustment_out, 0),
    coalesce(p.wastage_out, 0), coalesce(p.closing_stock, 0),
    coalesce(p.purchase_amount, 0), coalesce(b.current_stock, 0), coalesce(b.low_stock, false),
    coalesce(b.out_of_stock, true)
  from public.inventory_items i
  join public.inventory_categories c on c.id = i.category_id
  left join period p on p.item_id = i.id
  left join current_balances b on b.item_id = i.id
  where (p_item_id is null or i.id = p_item_id)
    and (p_category_id is null or i.category_id = p_category_id)
  order by i.active desc, i.name, i.id;
end $$;

create function public.inventory_report_usage_by_staff(
  p_from date, p_to date, p_item_id uuid default null, p_category_id uuid default null,
  p_staff_id uuid default null, p_unassigned boolean default false
) returns table (
  item_id uuid, item_name text, category_id uuid, category_name text, stock_unit text,
  staff_id uuid, staff_name text, total_quantity numeric, transaction_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from > p_to
     or p_to > public.farm_today() or p_to - p_from > 3660
     or (p_staff_id is not null and p_unassigned) then
    raise exception 'INVENTORY_REPORT_PERIOD_INVALID' using errcode = 'P0001';
  end if;

  return query
  select i.id, i.name, i.category_id, c.name, i.base_unit, s.id, s.name,
    sum(-m.quantity_delta)::numeric, count(*)::bigint
  from public.inventory_movements m
  join public.inventory_items i on i.id = m.item_id
  join public.inventory_categories c on c.id = i.category_id
  left join public.staff s on s.id = m.staff_id
  where m.movement_type = 'usage' and m.movement_date between p_from and p_to
    and (p_item_id is null or i.id = p_item_id)
    and (p_category_id is null or i.category_id = p_category_id)
    and (p_staff_id is null or m.staff_id = p_staff_id)
    and (not p_unassigned or m.staff_id is null)
  group by i.id, i.name, i.category_id, c.name, i.base_unit, s.id, s.name
  order by s.name nulls last, i.name, i.id;
end $$;

create function public.inventory_report_transactions(
  p_from date, p_to date, p_item_id uuid default null, p_category_id uuid default null,
  p_staff_id uuid default null, p_unassigned boolean default false, p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns table (
  movement_id uuid, movement_seq bigint, item_id uuid, item_name text, category_id uuid,
  category_name text, movement_date date, movement_type text, quantity_delta numeric,
  entered_quantity numeric, entered_unit text, stock_unit text, running_balance_after numeric,
  unit_rate numeric, total_amount numeric, account_name text, expense_id uuid, staff_id uuid,
  staff_name text, supplier text, reference text, batch_code text, expiry_date date,
  purpose text, reason text, note text, actor_id uuid, matched_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare v_search text := nullif(btrim(p_search), '');
begin
  if p_from is null or p_to is null or p_from > p_to
     or p_to > public.farm_today() or p_to - p_from > 3660
     or (p_staff_id is not null and p_unassigned)
     or char_length(coalesce(v_search, '')) > 120 then
    raise exception 'INVENTORY_REPORT_PERIOD_INVALID' using errcode = 'P0001';
  end if;
  if p_limit is null or p_offset is null or p_limit not between 1 and 200
     or p_offset not between 0 and 100000 then
    raise exception 'INVENTORY_REPORT_PAGE_INVALID' using errcode = 'P0001';
  end if;

  return query
  with ledger as (
    select m.*, sum(m.quantity_delta) over (
      partition by m.item_id order by m.movement_date, m.movement_seq
      rows between unbounded preceding and current row
    ) as balance_after
    from public.inventory_movements m
    where m.movement_date <= p_to
  ), filtered as (
    select l.*, i.name as item_label, i.category_id as item_category_id,
      c.name as category_label, i.base_unit, a.name as account_label, s.name as staff_label
    from ledger l
    join public.inventory_items i on i.id = l.item_id
    join public.inventory_categories c on c.id = i.category_id
    left join public.accounts a on a.id = l.account_id
    left join public.staff s on s.id = l.staff_id
    where l.movement_date between p_from and p_to
      and (p_item_id is null or i.id = p_item_id)
      and (p_category_id is null or i.category_id = p_category_id)
      and (p_staff_id is null or l.staff_id = p_staff_id)
      and (not p_unassigned or (l.movement_type = 'usage' and l.staff_id is null))
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', i.name, c.name,
        s.name, l.supplier, l.reference, l.purpose, l.reason, l.note))) > 0)
  )
  select f.id, f.movement_seq, f.item_id, f.item_label, f.item_category_id, f.category_label,
    f.movement_date, f.movement_type, f.quantity_delta, f.entered_quantity, f.entered_unit,
    f.base_unit, f.balance_after, f.unit_rate, f.total_amount, f.account_label, f.expense_id,
    f.staff_id, f.staff_label, f.supplier, f.reference, f.batch_code, f.expiry_date,
    f.purpose, f.reason, f.note, f.actor_id, count(*) over ()
  from filtered f
  order by f.movement_date, f.movement_seq
  limit p_limit offset p_offset;
end $$;

revoke all on function public.inventory_report_summary(date, date, uuid, uuid),
  public.inventory_report_usage_by_staff(date, date, uuid, uuid, uuid, boolean),
  public.inventory_report_transactions(date, date, uuid, uuid, uuid, boolean, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.inventory_report_summary(date, date, uuid, uuid),
  public.inventory_report_usage_by_staff(date, date, uuid, uuid, uuid, boolean),
  public.inventory_report_transactions(date, date, uuid, uuid, uuid, boolean, text, integer, integer)
  to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.inventory_report_summary(date, date, uuid, uuid),
      public.inventory_report_usage_by_staff(date, date, uuid, uuid, uuid, boolean),
      public.inventory_report_transactions(date, date, uuid, uuid, uuid, boolean, text, integer, integer)
      to anon;
  end if;
end $$;
