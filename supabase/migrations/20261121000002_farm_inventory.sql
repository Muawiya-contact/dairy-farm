-- Farm inventory is an append-only quantity ledger. Purchases also write one
-- existing Kharcha expense in the same transaction; usage never writes money.
create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(btrim(name)) <= 100),
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  create_request_id uuid unique,
  create_request_payload jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((create_request_id is null) = (create_request_payload is null))
);
create unique index inventory_categories_name_norm_uq
  on public.inventory_categories (lower(btrim(name)));

insert into public.inventory_categories (name, description, sort_order) values
  ('Animal feed & fodder', 'Feed, wanda, khal, chokar, and fodder.', 10),
  ('Medicines & veterinary', 'Medicine, vaccination, and veterinary supplies.', 20),
  ('Farm equipment & supplies', 'Equipment, tools, and repair supplies.', 30),
  ('Other consumables', 'Other items used in farm operations.', 40)
on conflict do nothing;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(btrim(name)) <= 120),
  category_id uuid not null references public.inventory_categories(id) on delete restrict,
  base_unit text not null check (base_unit in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')),
  item_type text not null check (item_type in ('consumable', 'durable')),
  minimum_stock numeric(14,6) not null default 0 check (minimum_stock >= 0),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  create_request_id uuid unique,
  create_request_payload jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((create_request_id is null) = (create_request_payload is null))
);
create unique index inventory_items_name_norm_uq
  on public.inventory_items (lower(btrim(name)));
create index inventory_items_category_active_idx
  on public.inventory_items (category_id, active, name);

create sequence public.inventory_movement_seq;
revoke all on sequence public.inventory_movement_seq from public, anon, authenticated;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  movement_seq bigint not null default nextval('public.inventory_movement_seq') unique,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_date date not null,
  movement_type text not null check (movement_type in ('opening', 'purchase', 'usage', 'adjustment', 'wastage')),
  quantity_delta numeric(14,6) not null check (quantity_delta <> 0),
  entered_quantity numeric(14,6) not null check (entered_quantity > 0),
  entered_unit text not null check (entered_unit in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')),
  stock_unit text not null check (stock_unit in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')),
  recorded_stock_before numeric(14,6) not null check (recorded_stock_before >= 0),
  recorded_stock_after numeric(14,6) not null check (recorded_stock_after >= 0),
  unit_rate numeric(12,4),
  total_amount numeric(12,2),
  account_id uuid references public.accounts(id) on delete restrict,
  expense_id uuid unique references public.expenses(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  supplier text,
  reference text,
  batch_code text,
  expiry_date date,
  purpose text,
  reason text,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null unique,
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint inventory_movement_recorded_balance check (
    round(recorded_stock_before + quantity_delta, 6) = recorded_stock_after
  ),
  constraint inventory_movement_financial_shape check (
    (movement_type = 'purchase' and quantity_delta > 0 and account_id is not null
      and expense_id is not null and unit_rate > 0 and total_amount > 0)
    or (movement_type = 'opening' and quantity_delta > 0 and account_id is null
      and expense_id is null and unit_rate is null and total_amount is null)
    or (movement_type = 'usage' and quantity_delta < 0 and account_id is null
      and expense_id is null and unit_rate is null and total_amount is null)
    or (movement_type in ('adjustment', 'wastage') and account_id is null
      and expense_id is null and unit_rate is null and total_amount is null
      and nullif(btrim(reason), '') is not null)
  )
);
create index inventory_movements_item_date_idx
  on public.inventory_movements (item_id, movement_date, movement_seq);
create index inventory_movements_date_idx
  on public.inventory_movements (movement_date, movement_type);

alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_categories_owner_read on public.inventory_categories
  for select to authenticated using ((select private.is_app_owner()));
create policy inventory_items_owner_read on public.inventory_items
  for select to authenticated using ((select private.is_app_owner()));
create policy inventory_movements_owner_read on public.inventory_movements
  for select to authenticated using ((select private.is_app_owner()));

revoke all on public.inventory_categories, public.inventory_items, public.inventory_movements
  from public, anon, authenticated;
grant select on public.inventory_categories, public.inventory_items, public.inventory_movements
  to authenticated;

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.inventory_categories, public.inventory_items, public.inventory_movements to anon;
    create policy inventory_categories_demo_read on public.inventory_categories
      for select to anon using ((select private.demo_access_enabled()));
    create policy inventory_items_demo_read on public.inventory_items
      for select to anon using ((select private.demo_access_enabled()));
    create policy inventory_movements_demo_read on public.inventory_movements
      for select to anon using ((select private.demo_access_enabled()));
  end if;
end $$;

create trigger subscription_write_guard
  before insert or update or delete on public.inventory_categories
  for each row execute function private.guard_subscription_write();
create trigger subscription_write_guard
  before insert or update or delete on public.inventory_items
  for each row execute function private.guard_subscription_write();
create trigger subscription_write_guard
  before insert or update or delete on public.inventory_movements
  for each row execute function private.guard_subscription_write();
create trigger inventory_movements_month_lock
  before insert or update or delete on public.inventory_movements
  for each row execute function public.trg_month_lock('movement_date');

create function public.inventory_movement_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'INVENTORY_MOVEMENT_IMMUTABLE: record a dated adjustment instead'
    using errcode = 'P0001';
end $$;
revoke all on function public.inventory_movement_immutable() from public, anon, authenticated;
create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.inventory_movement_immutable();

create function public.inventory_convert_quantity(p_quantity numeric, p_from_unit text, p_to_unit text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  v_from_family text;
  v_to_family text;
  v_from_factor numeric;
  v_to_factor numeric;
  v_result numeric;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 6) then
    raise exception 'INVENTORY_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if p_from_unit is null or p_to_unit is null
     or p_from_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or p_to_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton') then
    raise exception 'INVENTORY_UNIT_INVALID' using errcode = 'P0001';
  end if;
  if p_from_unit = p_to_unit then return p_quantity; end if;

  v_from_family := case when p_from_unit in ('kg', 'g', 'ton') then 'weight'
    when p_from_unit in ('litre', 'ml') then 'volume' else p_from_unit end;
  v_to_family := case when p_to_unit in ('kg', 'g', 'ton') then 'weight'
    when p_to_unit in ('litre', 'ml') then 'volume' else p_to_unit end;
  if v_from_family <> v_to_family then
    raise exception 'INVENTORY_UNIT_MISMATCH' using errcode = 'P0001';
  end if;

  v_from_factor := case p_from_unit
    when 'g' then 0.001 when 'ton' then 1000 when 'ml' then 0.001 else 1 end;
  v_to_factor := case p_to_unit
    when 'g' then 0.001 when 'ton' then 1000 when 'ml' then 0.001 else 1 end;
  v_result := round(p_quantity * v_from_factor / v_to_factor, 6);
  if v_result <= 0 then raise exception 'INVENTORY_QUANTITY_INVALID' using errcode = 'P0001'; end if;
  return v_result;
end $$;
revoke all on function public.inventory_convert_quantity(numeric, text, text) from public, anon, authenticated;

create function public.create_inventory_category_once(p_request_id uuid, p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(p_description), '');
  v_payload jsonb;
  v_saved jsonb;
  v_id uuid;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'INVENTORY_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'category.create', 'name', v_name, 'description', v_description);
  select id, create_request_payload into v_id, v_saved
    from public.inventory_categories where create_request_id = p_request_id for update;
  if v_id is not null then
    if v_saved <> v_payload then raise exception 'INVENTORY_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_id;
  end if;
  if v_name = '' or char_length(v_name) > 100 or char_length(coalesce(v_description, '')) > 500 then
    raise exception 'INVENTORY_CATEGORY_INVALID' using errcode = 'P0001';
  end if;
  insert into public.inventory_categories(name, description, create_request_id, create_request_payload, created_by, updated_by)
    values (v_name, v_description, p_request_id, v_payload, auth.uid(), auth.uid()) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'INVENTORY_CATEGORY_EXISTS' using errcode = 'P0001';
end $$;

create function public.update_inventory_category(
  p_category_id uuid, p_revision integer, p_name text, p_description text, p_active boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_row public.inventory_categories;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into v_row from public.inventory_categories where id = p_category_id for update;
  if not found then raise exception 'INVENTORY_CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_row.revision <> p_revision then raise exception 'INVENTORY_STALE' using errcode = 'P0001'; end if;
  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 100
     or char_length(coalesce(p_description, '')) > 500 or p_active is null then
    raise exception 'INVENTORY_CATEGORY_INVALID' using errcode = 'P0001';
  end if;
  if not p_active and exists (select 1 from public.inventory_items where category_id = p_category_id and active) then
    raise exception 'INVENTORY_CATEGORY_IN_USE' using errcode = 'P0001';
  end if;
  update public.inventory_categories set name = btrim(p_name), description = nullif(btrim(p_description), ''),
    active = p_active, revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
  where id = p_category_id;
  return true;
exception when unique_violation then
  raise exception 'INVENTORY_CATEGORY_EXISTS' using errcode = 'P0001';
end $$;

create function public.create_inventory_item_once(
  p_request_id uuid, p_name text, p_category_id uuid, p_base_unit text, p_item_type text,
  p_minimum_stock numeric, p_opening_quantity numeric default 0,
  p_opening_unit text default null, p_opening_date date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_opening_date date := coalesce(p_opening_date, public.farm_today());
  v_payload jsonb;
  v_saved jsonb;
  v_id uuid;
  v_delta numeric(14,6);
  v_seq bigint;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'INVENTORY_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'item.create', 'name', v_name,
    'category_id', p_category_id, 'base_unit', p_base_unit, 'item_type', p_item_type,
    'minimum_stock', p_minimum_stock, 'opening_quantity', p_opening_quantity,
    'opening_unit', coalesce(p_opening_unit, p_base_unit), 'opening_date', v_opening_date);
  select id, create_request_payload into v_id, v_saved
    from public.inventory_items where create_request_id = p_request_id for update;
  if v_id is not null then
    if v_saved <> v_payload then raise exception 'INVENTORY_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_id;
  end if;
  if v_name = '' or char_length(v_name) > 120 or p_item_type is null or p_item_type not in ('consumable', 'durable')
     or p_base_unit is null or p_base_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or coalesce(p_opening_unit, p_base_unit) not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or p_minimum_stock is null or p_minimum_stock < 0 or p_minimum_stock <> round(p_minimum_stock, 6)
     or p_opening_quantity is null or p_opening_quantity < 0 or p_opening_quantity <> round(p_opening_quantity, 6)
     or v_opening_date > public.farm_today() then
    raise exception 'INVENTORY_ITEM_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.inventory_categories where id = p_category_id and active) then
    raise exception 'INVENTORY_CATEGORY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.inventory_items(name, category_id, base_unit, item_type, minimum_stock,
    create_request_id, create_request_payload, created_by, updated_by)
  values (v_name, p_category_id, p_base_unit, p_item_type, p_minimum_stock,
    p_request_id, v_payload, auth.uid(), auth.uid()) returning id into v_id;

  if p_opening_quantity > 0 then
    v_delta := public.inventory_convert_quantity(p_opening_quantity, coalesce(p_opening_unit, p_base_unit), p_base_unit);
    v_seq := nextval('public.inventory_movement_seq');
    insert into public.inventory_movements(id, movement_seq, item_id, movement_date, movement_type,
      quantity_delta, entered_quantity, entered_unit, stock_unit, recorded_stock_before, recorded_stock_after,
      reason, actor_id, request_id, request_payload)
    values (gen_random_uuid(), v_seq, v_id, v_opening_date, 'opening', v_delta, p_opening_quantity,
      coalesce(p_opening_unit, p_base_unit), p_base_unit, 0, v_delta, 'Opening stock', auth.uid(), p_request_id,
      jsonb_build_object('operation', 'item.opening', 'item_id', v_id, 'quantity', p_opening_quantity,
        'unit', coalesce(p_opening_unit, p_base_unit), 'date', v_opening_date));
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'INVENTORY_ITEM_EXISTS' using errcode = 'P0001';
end $$;

create function public.update_inventory_item(
  p_item_id uuid, p_revision integer, p_name text, p_category_id uuid, p_base_unit text,
  p_item_type text, p_minimum_stock numeric, p_active boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_item public.inventory_items;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'INVENTORY_ITEM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_item.revision <> p_revision then raise exception 'INVENTORY_STALE' using errcode = 'P0001'; end if;
  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 120
     or p_item_type is null or p_item_type not in ('consumable', 'durable')
     or p_base_unit is null or p_base_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or p_minimum_stock is null or p_minimum_stock < 0 or p_minimum_stock <> round(p_minimum_stock, 6)
     or p_active is null then
    raise exception 'INVENTORY_ITEM_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.inventory_categories where id = p_category_id and active) then
    raise exception 'INVENTORY_CATEGORY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_base_unit <> v_item.base_unit and exists (
    select 1 from public.inventory_movements where item_id = p_item_id
  ) then
    raise exception 'INVENTORY_UNIT_IN_USE' using errcode = 'P0001';
  end if;
  if not p_active and exists (
    select 1 from public.inventory_movements where item_id = p_item_id group by item_id having sum(quantity_delta) <> 0
  ) then
    raise exception 'INVENTORY_ITEM_STOCK_REMAINS' using errcode = 'P0001';
  end if;
  update public.inventory_items set name = btrim(p_name), category_id = p_category_id,
    base_unit = p_base_unit, item_type = p_item_type, minimum_stock = p_minimum_stock,
    active = p_active, revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
  where id = p_item_id;
  return true;
exception when unique_violation then
  raise exception 'INVENTORY_ITEM_EXISTS' using errcode = 'P0001';
end $$;

create function public.record_inventory_purchase(
  p_request_id uuid, p_item_id uuid, p_quantity numeric, p_unit text, p_unit_rate numeric,
  p_total_amount numeric, p_movement_date date, p_account_id uuid, p_expense_category_id uuid,
  p_supplier text default null, p_reference text default null, p_note text default null,
  p_batch_code text default null, p_expiry_date date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_items;
  v_payload jsonb;
  v_saved jsonb;
  v_movement_id uuid;
  v_expense_id uuid;
  v_delta numeric(14,6);
  v_before numeric(14,6);
  v_after numeric(14,6);
  v_seq bigint;
  v_expense_note text;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'INVENTORY_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'purchase', 'item_id', p_item_id, 'quantity', p_quantity,
    'unit', p_unit, 'unit_rate', p_unit_rate, 'total_amount', p_total_amount, 'date', p_movement_date,
    'account_id', p_account_id, 'expense_category_id', p_expense_category_id,
    'supplier', nullif(btrim(p_supplier), ''), 'reference', nullif(btrim(p_reference), ''),
    'note', nullif(btrim(p_note), ''), 'batch_code', nullif(btrim(p_batch_code), ''), 'expiry_date', p_expiry_date);
  select id, request_payload into v_movement_id, v_saved
    from public.inventory_movements where request_id = p_request_id for update;
  if v_movement_id is not null then
    if v_saved <> v_payload then raise exception 'INVENTORY_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_movement_id;
  end if;
  if p_movement_date is null or p_movement_date > public.farm_today()
     or p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 6)
     or p_unit_rate is null or p_unit_rate <= 0 or p_unit_rate <> round(p_unit_rate, 4)
     or p_total_amount is null or p_total_amount <= 0 or p_total_amount <> round(p_total_amount, 2)
     or round(p_quantity * p_unit_rate, 2) <> p_total_amount
     or char_length(coalesce(p_supplier, '')) > 160 or char_length(coalesce(p_reference, '')) > 160
     or char_length(coalesce(p_note, '')) > 1000 or char_length(coalesce(p_batch_code, '')) > 100
     or (p_expiry_date is not null and p_expiry_date < p_movement_date) then
    raise exception 'INVENTORY_PURCHASE_INVALID' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found or not v_item.active then raise exception 'INVENTORY_ITEM_UNAVAILABLE' using errcode = 'P0001'; end if;
  v_delta := public.inventory_convert_quantity(p_quantity, p_unit, v_item.base_unit);
  if not exists (select 1 from public.expense_categories where id = p_expense_category_id
      and active and is_farm_cost and not is_salary) then
    raise exception 'INVENTORY_EXPENSE_CATEGORY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id and active
      and p_movement_date >= opening_date) then
    raise exception 'INVENTORY_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_expense_note := concat_ws(' · ', 'Inventory purchase: ' || v_item.name,
    to_char(p_quantity, 'FM999999990.######') || ' ' || p_unit,
    case when nullif(btrim(p_supplier), '') is null then null else 'Supplier: ' || btrim(p_supplier) end,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''));
  insert into public.expenses(expense_date, category_id, amount, account_id, note)
    values (p_movement_date, p_expense_category_id, p_total_amount, p_account_id, v_expense_note)
    returning id into v_expense_id;

  v_seq := nextval('public.inventory_movement_seq');
  select coalesce(sum(quantity_delta), 0) into v_before from public.inventory_movements
    where item_id = p_item_id and (movement_date, movement_seq) < (p_movement_date, v_seq);
  v_after := v_before + v_delta;
  v_movement_id := gen_random_uuid();
  insert into public.inventory_movements(id, movement_seq, item_id, movement_date, movement_type,
    quantity_delta, entered_quantity, entered_unit, stock_unit, recorded_stock_before, recorded_stock_after,
    unit_rate, total_amount, account_id, expense_id, supplier, reference, batch_code, expiry_date, note,
    actor_id, request_id, request_payload)
  values (v_movement_id, v_seq, p_item_id, p_movement_date, 'purchase', v_delta, p_quantity, p_unit,
    v_item.base_unit, v_before, v_after, p_unit_rate, p_total_amount, p_account_id, v_expense_id,
    nullif(btrim(p_supplier), ''), nullif(btrim(p_reference), ''), nullif(btrim(p_batch_code), ''),
    p_expiry_date, nullif(btrim(p_note), ''), auth.uid(), p_request_id, v_payload);

  if exists (select 1 from (
      select sum(quantity_delta) over (order by movement_date, movement_seq) as balance
      from public.inventory_movements where item_id = p_item_id
    ) ledger where balance < 0) then
    raise exception 'INVENTORY_NEGATIVE_STOCK' using errcode = 'P0001';
  end if;
  return v_movement_id;
end $$;

create function public.record_inventory_usage(
  p_request_id uuid, p_item_id uuid, p_quantity numeric, p_unit text, p_movement_date date,
  p_purpose text, p_staff_id uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_items;
  v_payload jsonb;
  v_saved jsonb;
  v_movement_id uuid;
  v_delta numeric(14,6);
  v_before numeric(14,6);
  v_after numeric(14,6);
  v_seq bigint;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'INVENTORY_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'usage', 'item_id', p_item_id, 'quantity', p_quantity,
    'unit', p_unit, 'date', p_movement_date, 'purpose', nullif(btrim(p_purpose), ''),
    'staff_id', p_staff_id, 'note', nullif(btrim(p_note), ''));
  select id, request_payload into v_movement_id, v_saved
    from public.inventory_movements where request_id = p_request_id for update;
  if v_movement_id is not null then
    if v_saved <> v_payload then raise exception 'INVENTORY_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_movement_id;
  end if;
  if p_movement_date is null or p_movement_date > public.farm_today()
     or p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 6)
     or nullif(btrim(p_purpose), '') is null or char_length(coalesce(p_purpose, '')) > 300
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'INVENTORY_USAGE_INVALID' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found or not v_item.active then raise exception 'INVENTORY_ITEM_UNAVAILABLE' using errcode = 'P0001'; end if;
  if p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id and active) then
    raise exception 'INVENTORY_STAFF_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_delta := -public.inventory_convert_quantity(p_quantity, p_unit, v_item.base_unit);
  v_seq := nextval('public.inventory_movement_seq');
  select coalesce(sum(quantity_delta), 0) into v_before from public.inventory_movements
    where item_id = p_item_id and (movement_date, movement_seq) < (p_movement_date, v_seq);
  v_after := v_before + v_delta;
  if v_after < 0 then raise exception 'INVENTORY_INSUFFICIENT_STOCK' using errcode = 'P0001'; end if;
  v_movement_id := gen_random_uuid();
  insert into public.inventory_movements(id, movement_seq, item_id, movement_date, movement_type,
    quantity_delta, entered_quantity, entered_unit, stock_unit, recorded_stock_before, recorded_stock_after,
    staff_id, purpose, note, actor_id, request_id, request_payload)
  values (v_movement_id, v_seq, p_item_id, p_movement_date, 'usage', v_delta, p_quantity, p_unit,
    v_item.base_unit, v_before, v_after, p_staff_id, btrim(p_purpose), nullif(btrim(p_note), ''),
    auth.uid(), p_request_id, v_payload);
  if exists (select 1 from (
      select sum(quantity_delta) over (order by movement_date, movement_seq) as balance
      from public.inventory_movements where item_id = p_item_id
    ) ledger where balance < 0) then
    raise exception 'INVENTORY_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;
  return v_movement_id;
end $$;

create function public.record_inventory_adjustment(
  p_request_id uuid, p_item_id uuid, p_quantity numeric, p_unit text, p_direction smallint,
  p_movement_date date, p_movement_type text, p_reason text, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_items;
  v_payload jsonb;
  v_saved jsonb;
  v_movement_id uuid;
  v_delta numeric(14,6);
  v_before numeric(14,6);
  v_after numeric(14,6);
  v_seq bigint;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'INVENTORY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'INVENTORY_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'adjustment', 'item_id', p_item_id,
    'quantity', p_quantity, 'unit', p_unit, 'direction', p_direction, 'date', p_movement_date,
    'movement_type', p_movement_type, 'reason', nullif(btrim(p_reason), ''), 'note', nullif(btrim(p_note), ''));
  select id, request_payload into v_movement_id, v_saved
    from public.inventory_movements where request_id = p_request_id for update;
  if v_movement_id is not null then
    if v_saved <> v_payload then raise exception 'INVENTORY_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_movement_id;
  end if;
  if p_movement_date is null or p_movement_date > public.farm_today()
     or p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 6)
     or p_direction is null or p_direction not in (-1, 1)
     or p_movement_type is null or p_movement_type not in ('adjustment', 'wastage')
     or (p_movement_type = 'wastage' and p_direction <> -1)
     or length(coalesce(nullif(btrim(p_reason), ''), '')) < 3 or char_length(coalesce(p_reason, '')) > 500
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'INVENTORY_ADJUSTMENT_INVALID' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found or not v_item.active then raise exception 'INVENTORY_ITEM_UNAVAILABLE' using errcode = 'P0001'; end if;
  v_delta := p_direction * public.inventory_convert_quantity(p_quantity, p_unit, v_item.base_unit);
  v_seq := nextval('public.inventory_movement_seq');
  select coalesce(sum(quantity_delta), 0) into v_before from public.inventory_movements
    where item_id = p_item_id and (movement_date, movement_seq) < (p_movement_date, v_seq);
  v_after := v_before + v_delta;
  if v_after < 0 then raise exception 'INVENTORY_INSUFFICIENT_STOCK' using errcode = 'P0001'; end if;
  v_movement_id := gen_random_uuid();
  insert into public.inventory_movements(id, movement_seq, item_id, movement_date, movement_type,
    quantity_delta, entered_quantity, entered_unit, stock_unit, recorded_stock_before, recorded_stock_after,
    reason, note, actor_id, request_id, request_payload)
  values (v_movement_id, v_seq, p_item_id, p_movement_date, p_movement_type, v_delta,
    p_quantity, p_unit, v_item.base_unit, v_before, v_after, btrim(p_reason), nullif(btrim(p_note), ''),
    auth.uid(), p_request_id, v_payload);
  if exists (select 1 from (
      select sum(quantity_delta) over (order by movement_date, movement_seq) as balance
      from public.inventory_movements where item_id = p_item_id
    ) ledger where balance < 0) then
    raise exception 'INVENTORY_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;
  return v_movement_id;
end $$;

create function public.inventory_stock_on(p_as_of date)
returns table (
  item_id uuid, item_name text, category_id uuid, category_name text, base_unit text,
  item_type text, minimum_stock numeric, active boolean, current_stock numeric,
  low_stock boolean, out_of_stock boolean, last_movement_date date, revision integer
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_as_of is null or p_as_of > public.farm_today() then
    raise exception 'INVENTORY_DATE_INVALID' using errcode = 'P0001';
  end if;
  return query
  select i.id, i.name, i.category_id, c.name, i.base_unit, i.item_type, i.minimum_stock, i.active,
    coalesce(sum(m.quantity_delta), 0)::numeric,
    i.minimum_stock > 0 and coalesce(sum(m.quantity_delta), 0) > 0 and coalesce(sum(m.quantity_delta), 0) <= i.minimum_stock,
    coalesce(sum(m.quantity_delta), 0) = 0,
    max(m.movement_date), i.revision
  from public.inventory_items i
  join public.inventory_categories c on c.id = i.category_id
  left join public.inventory_movements m on m.item_id = i.id and m.movement_date <= p_as_of
  group by i.id, i.name, i.category_id, c.name, i.base_unit, i.item_type, i.minimum_stock, i.active, i.revision
  order by i.active desc, i.name, i.id;
end $$;

create function public.inventory_item_history(p_item_id uuid, p_from date, p_to date)
returns table (
  movement_id uuid, movement_seq bigint, item_id uuid, movement_date date, movement_type text,
  quantity_delta numeric, entered_quantity numeric, entered_unit text, stock_unit text,
  recorded_stock_before numeric, recorded_stock_after numeric, running_balance_after numeric,
  unit_rate numeric, total_amount numeric, account_id uuid, account_name text, expense_id uuid,
  staff_id uuid, staff_name text, supplier text, reference text, batch_code text, expiry_date date,
  purpose text, reason text, note text, actor_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_item_id is null or p_from is null or p_to is null or p_from > p_to
     or p_to > public.farm_today() or p_to - p_from > 3660 then
    raise exception 'INVENTORY_HISTORY_PERIOD_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.inventory_items where id = p_item_id) then
    raise exception 'INVENTORY_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  return query
  with ordered as (
    select m.*, sum(m.quantity_delta) over (order by m.movement_date, m.movement_seq) as balance_after
    from public.inventory_movements m
    where m.item_id = p_item_id and m.movement_date <= p_to
  )
  select o.id, o.movement_seq, o.item_id, o.movement_date, o.movement_type, o.quantity_delta,
    o.entered_quantity, o.entered_unit, o.stock_unit, o.recorded_stock_before, o.recorded_stock_after,
    o.balance_after, o.unit_rate, o.total_amount, o.account_id, a.name, o.expense_id,
    o.staff_id, s.name, o.supplier, o.reference, o.batch_code, o.expiry_date,
    o.purpose, o.reason, o.note, o.actor_id
  from ordered o
  left join public.accounts a on a.id = o.account_id
  left join public.staff s on s.id = o.staff_id
  where o.movement_date between p_from and p_to
  order by o.movement_date, o.movement_seq;
end $$;

revoke all on function public.create_inventory_category_once(uuid, text, text),
  public.update_inventory_category(uuid, integer, text, text, boolean),
  public.create_inventory_item_once(uuid, text, uuid, text, text, numeric, numeric, text, date),
  public.update_inventory_item(uuid, integer, text, uuid, text, text, numeric, boolean),
  public.record_inventory_purchase(uuid, uuid, numeric, text, numeric, numeric, date, uuid, uuid, text, text, text, text, date),
  public.record_inventory_usage(uuid, uuid, numeric, text, date, text, uuid, text),
  public.record_inventory_adjustment(uuid, uuid, numeric, text, smallint, date, text, text, text),
  public.inventory_stock_on(date), public.inventory_item_history(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.create_inventory_category_once(uuid, text, text),
  public.update_inventory_category(uuid, integer, text, text, boolean),
  public.create_inventory_item_once(uuid, text, uuid, text, text, numeric, numeric, text, date),
  public.update_inventory_item(uuid, integer, text, uuid, text, text, numeric, boolean),
  public.record_inventory_purchase(uuid, uuid, numeric, text, numeric, numeric, date, uuid, uuid, text, text, text, text, date),
  public.record_inventory_usage(uuid, uuid, numeric, text, date, text, uuid, text),
  public.record_inventory_adjustment(uuid, uuid, numeric, text, smallint, date, text, text, text),
  public.inventory_stock_on(date), public.inventory_item_history(uuid, date, date)
  to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.create_inventory_category_once(uuid, text, text),
      public.update_inventory_category(uuid, integer, text, text, boolean),
      public.create_inventory_item_once(uuid, text, uuid, text, text, numeric, numeric, text, date),
      public.update_inventory_item(uuid, integer, text, uuid, text, text, numeric, boolean),
      public.record_inventory_purchase(uuid, uuid, numeric, text, numeric, numeric, date, uuid, uuid, text, text, text, text, date),
      public.record_inventory_usage(uuid, uuid, numeric, text, date, text, uuid, text),
      public.record_inventory_adjustment(uuid, uuid, numeric, text, smallint, date, text, text, text),
      public.inventory_stock_on(date), public.inventory_item_history(uuid, date, date)
      to anon;
  end if;
end $$;
