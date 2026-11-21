-- Per-animal feed is a quantity ledger entry linked to exactly one existing
-- inventory usage movement. Inventory purchases remain the only cash expense.
create table public.animal_feed_entries (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  feed_date date not null,
  quantity numeric(14,6) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')),
  note text check (note is null or char_length(note) <= 1000),
  stock_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  request_id uuid not null unique,
  request_payload jsonb not null,
  supersedes_id uuid references public.animal_feed_entries(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (supersedes_id is null or supersedes_id <> id)
);
create unique index animal_feed_entries_one_correction_uq
  on public.animal_feed_entries(supersedes_id) where supersedes_id is not null;
create index animal_feed_entries_animal_date_idx
  on public.animal_feed_entries(animal_id, feed_date, created_at);

alter table public.animal_feed_entries enable row level security;
create policy animal_feed_entries_owner_read on public.animal_feed_entries
  for select to authenticated using ((select private.is_app_owner()));
revoke all on public.animal_feed_entries from public, anon, authenticated;
grant select on public.animal_feed_entries to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.animal_feed_entries to anon;
    create policy animal_feed_entries_demo_read on public.animal_feed_entries
      for select to anon using ((select private.demo_access_enabled()));
  end if;
end $$;

create trigger subscription_write_guard before insert or update or delete on public.animal_feed_entries
  for each row execute function private.guard_subscription_write();
create trigger animal_feed_entries_month_lock before insert or update or delete on public.animal_feed_entries
  for each row execute function public.trg_month_lock('feed_date');

create function public.animal_feed_entry_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ANIMAL_FEED_IMMUTABLE: add an auditable correction instead' using errcode = 'P0001';
end $$;
revoke all on function public.animal_feed_entry_immutable() from public, anon, authenticated;
create trigger animal_feed_entries_immutable before update or delete on public.animal_feed_entries
  for each row execute function public.animal_feed_entry_immutable();

create function public.record_animal_feed_once(
  p_request_id uuid, p_animal_id uuid, p_item_id uuid, p_quantity numeric,
  p_unit text, p_feed_date date, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_animal public.animals;
  v_payload jsonb;
  v_saved jsonb;
  v_entry_id uuid;
  v_movement_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'ANIMAL_FEED_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'ANIMAL_FEED_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'record', 'animal_id', p_animal_id, 'item_id', p_item_id,
    'quantity', p_quantity, 'unit', p_unit, 'date', p_feed_date, 'note', v_note);
  select id, request_payload into v_entry_id, v_saved
    from public.animal_feed_entries where request_id = p_request_id for update;
  if v_entry_id is not null then
    if v_saved <> v_payload then raise exception 'ANIMAL_FEED_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_entry_id;
  end if;
  if p_animal_id is null or p_item_id is null or p_feed_date is null
     or p_feed_date > public.farm_today() or p_quantity is null or p_quantity <= 0
     or p_quantity <> round(p_quantity, 6)
     or p_unit is null or p_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'ANIMAL_FEED_INVALID' using errcode = 'P0001';
  end if;
  select * into v_animal from public.animals where id = p_animal_id for update;
  if not found then raise exception 'ANIMAL_FEED_ANIMAL_UNAVAILABLE' using errcode = 'P0001'; end if;
  if (v_animal.arrival_date is not null and p_feed_date < v_animal.arrival_date)
     or (v_animal.arrival_date is null and v_animal.birth_date is not null and p_feed_date < v_animal.birth_date)
     or (v_animal.exit_date is not null and p_feed_date > v_animal.exit_date) then
    raise exception 'ANIMAL_FEED_OUTSIDE_STAY' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.inventory_items i
      join public.inventory_categories c on c.id = i.category_id
      where i.id = p_item_id and i.active and i.item_type = 'consumable'
        and c.active and lower(btrim(c.name)) = 'animal feed & fodder') then
    raise exception 'ANIMAL_FEED_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_movement_id := public.record_inventory_usage(p_request_id, p_item_id, p_quantity, p_unit,
    p_feed_date, 'Animal feed for ' || v_animal.tag, null, v_note);
  insert into public.animal_feed_entries(animal_id, inventory_item_id, feed_date, quantity, unit,
    note, stock_movement_id, request_id, request_payload)
  values (p_animal_id, p_item_id, p_feed_date, p_quantity, p_unit, v_note,
    v_movement_id, p_request_id, v_payload)
  returning id into v_entry_id;
  return v_entry_id;
end $$;

create function public.correct_animal_feed_once(
  p_request_id uuid, p_feed_entry_id uuid, p_item_id uuid, p_quantity numeric,
  p_unit text, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.animal_feed_entries;
  v_old_item public.inventory_items;
  v_animal public.animals;
  v_payload jsonb;
  v_saved jsonb;
  v_entry_id uuid;
  v_restore_request uuid;
  v_restore_payload jsonb;
  v_restore_movement uuid;
  v_usage_request uuid;
  v_usage_movement uuid;
  v_seq bigint;
  v_before numeric(14,6);
  v_delta numeric(14,6);
  v_today date := public.farm_today();
  v_note text := nullif(btrim(p_note), '');
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'ANIMAL_FEED_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'ANIMAL_FEED_REQUEST_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  v_payload := jsonb_build_object('operation', 'correct', 'feed_entry_id', p_feed_entry_id,
    'item_id', p_item_id, 'quantity', p_quantity, 'unit', p_unit, 'note', v_note);
  select id, request_payload into v_entry_id, v_saved
    from public.animal_feed_entries where request_id = p_request_id for update;
  if v_entry_id is not null then
    if v_saved <> v_payload then raise exception 'ANIMAL_FEED_REQUEST_CHANGED' using errcode = 'P0001'; end if;
    return v_entry_id;
  end if;
  if p_feed_entry_id is null or p_item_id is null or p_quantity is null or p_quantity <= 0
     or p_quantity <> round(p_quantity, 6)
     or p_unit is null or p_unit not in ('kg', 'g', 'litre', 'ml', 'bag', 'bori', 'piece', 'bottle', 'ton')
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'ANIMAL_FEED_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('animal-feed-entry:' || p_feed_entry_id::text));
  select * into v_old from public.animal_feed_entries where id = p_feed_entry_id for update;
  if not found or exists (select 1 from public.animal_feed_entries where supersedes_id = p_feed_entry_id) then
    raise exception 'ANIMAL_FEED_STALE' using errcode = 'P0001';
  end if;
  select * into v_animal from public.animals where id = v_old.animal_id;
  if not exists (select 1 from public.inventory_items i
      join public.inventory_categories c on c.id = i.category_id
      where i.id = p_item_id and i.active and i.item_type = 'consumable'
        and c.active and lower(btrim(c.name)) = 'animal feed & fodder') then
    raise exception 'ANIMAL_FEED_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select * into v_old_item from public.inventory_items where id = v_old.inventory_item_id for update;
  perform 1 from public.inventory_items where id = p_item_id for update;

  -- The original stock issue remains immutable. Post a positive adjustment and
  -- the replacement usage today; the corrected feed history retains its actual
  -- consumption date. This also works if the old item has since been archived.
  v_restore_request := (substr(md5(p_request_id::text || ':restore'), 1, 8) || '-' ||
    substr(md5(p_request_id::text || ':restore'), 9, 4) || '-' ||
    substr(md5(p_request_id::text || ':restore'), 13, 4) || '-' ||
    substr(md5(p_request_id::text || ':restore'), 17, 4) || '-' ||
    substr(md5(p_request_id::text || ':restore'), 21, 12))::uuid;
  v_usage_request := (substr(md5(p_request_id::text || ':usage'), 1, 8) || '-' ||
    substr(md5(p_request_id::text || ':usage'), 9, 4) || '-' ||
    substr(md5(p_request_id::text || ':usage'), 13, 4) || '-' ||
    substr(md5(p_request_id::text || ':usage'), 17, 4) || '-' ||
    substr(md5(p_request_id::text || ':usage'), 21, 12))::uuid;
  v_restore_payload := jsonb_build_object('operation', 'adjustment', 'item_id', v_old.inventory_item_id,
    'quantity', v_old.quantity, 'unit', v_old.unit, 'direction', 1, 'date', v_today,
    'movement_type', 'adjustment', 'reason', 'Animal feed correction', 'note', 'Restore superseded feed entry ' || v_old.id);
  v_delta := public.inventory_convert_quantity(v_old.quantity, v_old.unit, v_old_item.base_unit);
  v_seq := nextval('public.inventory_movement_seq');
  select coalesce(sum(quantity_delta), 0) into v_before from public.inventory_movements
    where item_id = v_old.inventory_item_id and (movement_date, movement_seq) < (v_today, v_seq);
  v_restore_movement := gen_random_uuid();
  insert into public.inventory_movements(id, movement_seq, item_id, movement_date, movement_type,
    quantity_delta, entered_quantity, entered_unit, stock_unit, recorded_stock_before, recorded_stock_after,
    reason, note, actor_id, request_id, request_payload)
  values (v_restore_movement, v_seq, v_old.inventory_item_id, v_today, 'adjustment', v_delta,
    v_old.quantity, v_old.unit, v_old_item.base_unit, v_before, v_before + v_delta,
    'Animal feed correction', 'Restore superseded feed entry ' || v_old.id, auth.uid(), v_restore_request, v_restore_payload);
  if exists (select 1 from (
      select sum(quantity_delta) over (order by movement_date, movement_seq) as balance
      from public.inventory_movements where item_id = v_old.inventory_item_id
    ) ledger where balance < 0) then
    raise exception 'INVENTORY_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  v_usage_movement := public.record_inventory_usage(v_usage_request, p_item_id, p_quantity, p_unit,
    v_today, 'Corrected animal feed for ' || v_animal.tag, null, 'Correction to feed entry ' || v_old.id);
  insert into public.animal_feed_entries(animal_id, inventory_item_id, feed_date, quantity, unit,
    note, stock_movement_id, request_id, request_payload, supersedes_id)
  values (v_old.animal_id, p_item_id, v_old.feed_date, p_quantity, p_unit, v_note,
    v_usage_movement, p_request_id, v_payload, v_old.id)
  returning id into v_entry_id;
  return v_entry_id;
end $$;

revoke all on function public.record_animal_feed_once(uuid, uuid, uuid, numeric, text, date, text),
  public.correct_animal_feed_once(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.record_animal_feed_once(uuid, uuid, uuid, numeric, text, date, text),
  public.correct_animal_feed_once(uuid, uuid, uuid, numeric, text, text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.record_animal_feed_once(uuid, uuid, uuid, numeric, text, date, text),
      public.correct_animal_feed_once(uuid, uuid, uuid, numeric, text, text) to anon;
  end if;
end $$;
