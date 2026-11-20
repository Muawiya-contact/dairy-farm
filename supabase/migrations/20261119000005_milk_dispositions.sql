-- One authoritative, shift-aware ledger for non-sale milk dispositions.
-- Existing day-level waste rows are migrated as unassigned waste entries so
-- reports retain their balances and the old report action can keep working.
create table public.milk_dispositions (
  id uuid primary key default gen_random_uuid(),
  milk_date date not null,
  shift_id uuid references public.milk_shifts(id) on delete cascade,
  disposition_type text not null check (disposition_type in ('free','internal','wastage')),
  category text not null,
  litres numeric(10,2) not null check (litres > 0 and litres <= 5000),
  recipient text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (disposition_type = 'free' and category in ('employee','friend','guest','charity','other')) or
    (disposition_type = 'internal' and category in ('owner_home','farm_use')) or
    (disposition_type = 'wastage' and category in ('spillage','spoiled','other'))
  ),
  check (shift_id is not null or disposition_type = 'wastage'),
  check (recipient is null or char_length(trim(recipient)) between 1 and 200),
  check (note is null or char_length(trim(note)) between 1 and 500),
  check (disposition_type <> 'wastage' or (note is not null and char_length(trim(note)) between 3 and 500)),
  check (disposition_type <> 'free' or
    (coalesce(char_length(trim(recipient)),0) >= 3 or coalesce(char_length(trim(note)),0) >= 3))
);
create index milk_dispositions_date_shift_idx on public.milk_dispositions(milk_date, shift_id);
create index milk_dispositions_type_date_idx on public.milk_dispositions(disposition_type, milk_date);
create unique index milk_dispositions_one_unassigned_waste_per_day
  on public.milk_dispositions(milk_date)
  where shift_id is null and disposition_type = 'wastage';

alter table public.milk_dispositions enable row level security;
create policy owner_all on public.milk_dispositions for all to authenticated
  using ((select private.is_app_owner())) with check ((select private.is_app_owner()));

create function public.trg_milk_disposition_validate()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_shift_date date;
begin
  if new.milk_date > public.farm_today() then raise exception 'FUTURE_DATE'; end if;
  if new.shift_id is null then
    if new.disposition_type <> 'wastage' then raise exception 'MILK_DISPOSITION_INVALID'; end if;
  else
    select milk_date into v_shift_date from public.milk_shifts where id = new.shift_id;
    if v_shift_date is null or v_shift_date <> new.milk_date then raise exception 'MILK_DISPOSITION_SHIFT_INVALID'; end if;
  end if;
  new.recipient := nullif(trim(new.recipient), '');
  new.note := nullif(trim(new.note), '');
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger milk_dispositions_validate before insert or update on public.milk_dispositions
  for each row execute function public.trg_milk_disposition_validate();

create function public.trg_milk_disposition_touch_shift()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' and old.shift_id is not null then
    update public.milk_shifts set updated_at = clock_timestamp() where id = old.shift_id;
  end if;
  if tg_op <> 'DELETE' and new.shift_id is not null then
    update public.milk_shifts set updated_at = clock_timestamp() where id = new.shift_id;
  end if;
  return null;
end $$;
create trigger milk_dispositions_touch_shift after insert or update or delete on public.milk_dispositions
  for each row execute function public.trg_milk_disposition_touch_shift();

-- Validate the final transaction state so both the new UI and older open tabs
-- cannot save sales plus dispositions greater than the recorded production.
create function public.trg_milk_distribution_allocation_check()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_date date; v_shift text; v_total numeric; v_allocated numeric;
begin
  if tg_table_name = 'milk_shifts' then
    if tg_op = 'DELETE' then v_date := old.milk_date; v_shift := old.shift;
    else v_date := new.milk_date; v_shift := new.shift; end if;
  elsif tg_table_name = 'milk_deliveries' then
    if tg_op = 'DELETE' then v_date := old.delivery_date; v_shift := old.shift;
    else v_date := new.delivery_date; v_shift := new.shift; end if;
  else
    if tg_op = 'DELETE' then
      if old.shift_id is null then return null; end if;
      v_date := old.milk_date;
      select shift into v_shift from public.milk_shifts where id = old.shift_id;
    else
      if new.shift_id is null then return null; end if;
      v_date := new.milk_date;
      select shift into v_shift from public.milk_shifts where id = new.shift_id;
    end if;
  end if;
  select total_litres into v_total from public.milk_shifts where milk_date = v_date and shift = v_shift;
  if v_total is null then return null; end if;
  select coalesce((select sum(litres) from public.milk_deliveries where delivery_date = v_date and shift = v_shift),0)
       + coalesce((select sum(md.litres) from public.milk_dispositions md join public.milk_shifts s on s.id = md.shift_id
                   where s.milk_date = v_date and s.shift = v_shift),0)
    into v_allocated;
  if v_allocated > v_total then
    raise exception 'MILK_DISTRIBUTION_EXCEEDS_PRODUCTION' using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger milk_shift_distribution_check after insert or update on public.milk_shifts
  deferrable initially deferred for each row execute function public.trg_milk_distribution_allocation_check();
create constraint trigger milk_delivery_distribution_check after insert or update or delete on public.milk_deliveries
  deferrable initially deferred for each row execute function public.trg_milk_distribution_allocation_check();
create constraint trigger milk_disposition_distribution_check after insert or update or delete on public.milk_dispositions
  deferrable initially deferred for each row execute function public.trg_milk_distribution_allocation_check();

-- Preserve the old daily waste source before replacing its table with the
-- unified disposition ledger.
insert into public.milk_dispositions(milk_date, disposition_type, category, litres, note, created_at, updated_at)
select milk_date, 'wastage', 'other', wasted_litres, waste_reason, updated_at, updated_at
from public.milk_day_adjustments where wasted_litres > 0;

-- Copy historical rows before installing write guards so previously closed
-- months and expired subscriptions do not prevent a schema migration.
create trigger subscription_write_guard before insert or update or delete on public.milk_dispositions
  for each row execute function private.guard_subscription_write();
create trigger milk_dispositions_month_lock before insert or update or delete on public.milk_dispositions
  for each row execute function public.trg_month_lock('milk_date');

drop function public.save_milk_day_waste(date,numeric,text);
drop function public.milk_report_date_bounds();
drop function public.milk_report_summary(date,date);
drop function public.milk_report_daily(date,date);
drop trigger milk_day_adjustment_validate on public.milk_day_adjustments;
drop function public.trg_milk_day_adjustment_validate();
drop table public.milk_day_adjustments;

create function public.save_milk_day_waste(p_date date, p_wasted_litres numeric, p_reason text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_available numeric;
begin
  if p_date is null or p_wasted_litres is null or p_wasted_litres < 0
     or p_wasted_litres > 5000 or p_wasted_litres <> round(p_wasted_litres, 2) then
    raise exception 'MILK_WASTE_INVALID';
  end if;
  if p_date > public.farm_today() then raise exception 'FUTURE_DATE'; end if;
  if p_wasted_litres > 0 and char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'MILK_WASTE_REASON_REQUIRED';
  end if;

  select greatest(
    coalesce((select sum(total_litres) from public.milk_shifts where milk_date < p_date),0)
    - coalesce((select sum(litres) from public.milk_deliveries where delivery_date < p_date),0)
    - coalesce((select sum(litres) from public.milk_dispositions where milk_date < p_date),0)
    + coalesce((select sum(total_litres) from public.milk_shifts where milk_date = p_date),0)
    - coalesce((select sum(litres) from public.milk_deliveries where delivery_date = p_date),0)
    - coalesce((select sum(litres) from public.milk_dispositions where milk_date = p_date and shift_id is not null),0),0)
    into v_available;
  if p_wasted_litres > v_available then raise exception 'MILK_WASTE_EXCEEDS_AVAILABLE'; end if;

  if p_wasted_litres = 0 then
    delete from public.milk_dispositions where milk_date = p_date and shift_id is null and disposition_type = 'wastage';
  else
    insert into public.milk_dispositions(milk_date, shift_id, disposition_type, category, litres, note)
    values (p_date, null, 'wastage', 'other', p_wasted_litres, trim(p_reason))
    on conflict (milk_date) where shift_id is null and disposition_type = 'wastage'
    do update set litres = excluded.litres, note = excluded.note, updated_at = clock_timestamp();
  end if;
end $$;

create function public.save_milk_entry_with_dispositions(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb, p_dispositions jsonb,
  p_expected_updated_at timestamptz, p_notes text
) returns timestamptz language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_shift_id uuid; v_updated_at timestamptz; v_count integer;
begin
  if jsonb_typeof(p_dispositions) is distinct from 'array' then
    raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_dispositions) d
      where jsonb_typeof(d) <> 'object' or d->>'disposition_type' is null or d->>'category' is null or d->>'litres' is null) then
    raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_dispositions) as d(disposition_type text, category text, litres numeric, recipient text, note text)
  where litres is null or litres <= 0 or litres > 5000 or litres <> round(litres,2)
    or (disposition_type = 'free' and category not in ('employee','friend','guest','charity','other'))
    or (disposition_type = 'internal' and category not in ('owner_home','farm_use'))
    or (disposition_type = 'wastage' and category not in ('spillage','spoiled','other'))
    or disposition_type not in ('free','internal','wastage')
    or (disposition_type = 'wastage' and char_length(trim(coalesce(note,''))) not between 3 and 500)
    or (disposition_type = 'free' and
      coalesce(char_length(trim(recipient)),0) < 3 and coalesce(char_length(trim(note)),0) < 3)
    or (recipient is not null and char_length(trim(recipient)) > 200)
    or (note is not null and char_length(trim(note)) > 500);
  if v_count > 0 then raise exception 'MILK_DISPOSITION_INVALID' using errcode = 'P0001'; end if;
  if (select coalesce(sum(litres),0) from jsonb_to_recordset(p_deliveries) as d(customer_id uuid, litres numeric))
     + (select coalesce(sum(litres),0) from jsonb_to_recordset(p_dispositions) as d(disposition_type text, category text, litres numeric, recipient text, note text)) > p_total then
    raise exception 'MILK_DISTRIBUTION_EXCEEDS_PRODUCTION' using errcode = 'P0001';
  end if;

  -- The existing checked RPC retains its stale-write, month-lock, date,
  -- animal, delivery, and automatic Naqd receipt safeguards.
  v_updated_at := public.save_milk_entry_checked(p_date, p_shift, p_total, p_mode, p_animals, p_deliveries, p_expected_updated_at, p_notes);
  select id into v_shift_id from public.milk_shifts where milk_date = p_date and shift = p_shift;
  delete from public.milk_dispositions where shift_id = v_shift_id;
  insert into public.milk_dispositions(milk_date, shift_id, disposition_type, category, litres, recipient, note)
    select p_date, v_shift_id, d.disposition_type, d.category, d.litres,
      nullif(trim(d.recipient),''), nullif(trim(d.note),'')
    from jsonb_to_recordset(p_dispositions) as d(disposition_type text, category text, litres numeric, recipient text, note text);
  select updated_at into v_updated_at from public.milk_shifts where id = v_shift_id;
  return v_updated_at;
end $$;

create function public.correct_milk_entry_with_dispositions(
  p_date date, p_shift text, p_total numeric, p_mode text,
  p_animals jsonb, p_deliveries jsonb, p_dispositions jsonb,
  p_expected_updated_at timestamptz, p_notes text, p_reason text
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_shift public.milk_shifts%rowtype; v_before jsonb; v_after jsonb; v_updated timestamptz;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'MILK_CORRECTION_REASON' using errcode = 'P0001';
  end if;
  select * into v_shift from public.milk_shifts where milk_date = p_date and shift = p_shift for update;
  if v_shift.id is null or v_shift.updated_at is distinct from p_expected_updated_at then
    raise exception 'MILK_STALE: yeh shift badal chuki hai' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'shift', to_jsonb(v_shift),
    'animals', coalesce((select jsonb_agg(to_jsonb(a) order by a.animal_id) from public.animal_milk a where a.shift_id = v_shift.id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.customer_id) from public.milk_deliveries d where d.delivery_date = p_date and d.shift = p_shift), '[]'::jsonb),
    'dispositions', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.milk_dispositions d where d.shift_id = v_shift.id), '[]'::jsonb)
  ) into v_before;
  v_updated := public.save_milk_entry_with_dispositions(p_date,p_shift,p_total,p_mode,p_animals,p_deliveries,p_dispositions,p_expected_updated_at,p_notes);
  select jsonb_build_object(
    'shift', to_jsonb(s),
    'animals', coalesce((select jsonb_agg(to_jsonb(a) order by a.animal_id) from public.animal_milk a where a.shift_id = s.id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.customer_id) from public.milk_deliveries d where d.delivery_date = p_date and d.shift = p_shift), '[]'::jsonb),
    'dispositions', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.milk_dispositions d where d.shift_id = s.id), '[]'::jsonb)
  ) into v_after from public.milk_shifts s where s.id = v_shift.id;
  insert into private.milk_entry_audit(shift_id,milk_date,shift,before_row,after_row,reason,actor_id)
    values(v_shift.id,p_date,p_shift,v_before,v_after,trim(p_reason),auth.uid());
  return v_updated;
end $$;

create function public.milk_report_date_bounds()
returns table (first_date date, last_date date)
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(min(d.report_day), public.farm_today()), coalesce(max(d.report_day), public.farm_today())
  from (
    select milk_date as report_day from public.milk_shifts
    union all select delivery_date from public.milk_deliveries
    union all select milk_date from public.milk_dispositions
  ) d
$$;

create function public.milk_report_daily(p_from date, p_to date)
returns table (
  report_date date, opening_litres numeric, produced_litres numeric, available_litres numeric,
  sold_litres numeric, charity_litres numeric, farm_use_litres numeric, wasted_litres numeric,
  waste_reason text, day_wasted_litres numeric, day_waste_reason text, closing_litres numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from,p_to);
  return query with days as (
    select d::date report_date from generate_series(p_from,p_to,interval '1 day') d
  ), produced as (
    select milk_date, sum(total_litres) litres from public.milk_shifts where milk_date <= p_to group by milk_date
  ), delivered as (
    select d.delivery_date, sum(d.litres) total,
      sum(d.litres) filter (where c.kind='free') charity
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id
    where d.delivery_date <= p_to group by d.delivery_date
  ), dispositions as (
    select milk_date,
      coalesce(sum(litres) filter (where disposition_type='free'),0) free_litres,
      coalesce(sum(litres) filter (where disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(litres) filter (where disposition_type='wastage'),0) wasted_litres,
      string_agg(distinct note,'; ' order by note) filter (where disposition_type='wastage') waste_reason,
      coalesce(sum(litres) filter (where disposition_type='wastage' and shift_id is null),0) day_wasted_litres,
      string_agg(distinct note,'; ' order by note) filter (where disposition_type='wastage' and shift_id is null) day_waste_reason
    from public.milk_dispositions where milk_date <= p_to group by milk_date
  ), movements as (
    select days.report_date, coalesce(p.litres,0) produced, coalesce(d.total,0) delivered,
      coalesce(d.charity,0) old_charity, coalesce(x.free_litres,0) new_free,
      coalesce(x.farm_use_litres,0) farm_use, coalesce(x.wasted_litres,0) wasted,
      x.waste_reason, coalesce(x.day_wasted_litres,0) day_wasted, x.day_waste_reason
    from days left join produced p on p.milk_date=days.report_date
      left join delivered d on d.delivery_date=days.report_date
      left join dispositions x on x.milk_date=days.report_date
  ), opening as (
    select coalesce((select sum(total_litres) from public.milk_shifts where milk_date < p_from),0)
      - coalesce((select sum(litres) from public.milk_deliveries where delivery_date < p_from),0)
      - coalesce((select sum(litres) from public.milk_dispositions where milk_date < p_from),0) value
  ), balances as (
    select m.*,
      o.value + coalesce(sum(m.produced-m.delivered-m.new_free-m.farm_use-m.wasted) over
        (order by m.report_date rows between unbounded preceding and 1 preceding),0) opening,
      o.value + sum(m.produced-m.delivered-m.new_free-m.farm_use-m.wasted) over (order by m.report_date) closing
    from movements m cross join opening o
  )
  select b.report_date,b.opening,b.produced,b.opening+b.produced,
    b.delivered-b.old_charity,b.old_charity+b.new_free,b.farm_use,b.wasted,b.waste_reason,
    b.day_wasted,b.day_waste_reason,b.closing
  from balances b order by b.report_date;
end $$;

create function public.milk_report_summary(p_from date, p_to date)
returns table (
  opening_litres numeric, produced_litres numeric, available_litres numeric, sold_litres numeric,
  charity_litres numeric, farm_use_litres numeric, wasted_litres numeric, closing_litres numeric,
  sales_amount numeric, received_amount numeric, outstanding_amount numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_report_period(p_from,p_to);
  return query with daily as (select * from public.milk_report_daily(p_from,p_to)),
  customers as (select * from public.milk_report_customers(p_from,p_to)),
  customer_totals as (
    select coalesce(sum(c.charged),0) sales, coalesce(sum(c.paid),0) received,
      coalesce(sum(c.outstanding),0) outstanding from customers c
  )
  select (array_agg(d.opening_litres order by d.report_date))[1],coalesce(sum(d.produced_litres),0),
    (array_agg(d.opening_litres order by d.report_date))[1]+coalesce(sum(d.produced_litres),0),
    coalesce(sum(d.sold_litres),0),coalesce(sum(d.charity_litres),0),coalesce(sum(d.farm_use_litres),0),
    coalesce(sum(d.wasted_litres),0),(array_agg(d.closing_litres order by d.report_date desc))[1],
    t.sales,t.received,t.outstanding
  from daily d cross join customer_totals t group by t.sales,t.received,t.outstanding;
end $$;

create function public.milk_day_distribution_summary(p_date date)
returns table (
  report_date date, opening_litres numeric, produced_litres numeric, available_litres numeric,
  khata_litres numeric, cash_litres numeric, free_litres numeric, farm_use_litres numeric,
  wasted_litres numeric, allocated_litres numeric, remaining_litres numeric,
  khata_amount numeric, cash_sale_amount numeric, cash_received numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_date is null or p_date > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  return query with opening as (
    select coalesce((select sum(total_litres) from public.milk_shifts where milk_date < p_date),0)
      - coalesce((select sum(litres) from public.milk_deliveries where delivery_date < p_date),0)
      - coalesce((select sum(litres) from public.milk_dispositions where milk_date < p_date),0) litres
  ), production as (
    select coalesce(sum(total_litres),0) litres from public.milk_shifts where milk_date=p_date
  ), deliveries as (
    select coalesce(sum(d.litres) filter (where c.kind in ('regular','contractor','company')),0) khata_litres,
      coalesce(sum(d.litres) filter (where c.kind='cash'),0) cash_litres,
      coalesce(sum(d.litres) filter (where c.kind='free'),0) legacy_free_litres,
      coalesce(sum(d.litres),0) total_litres,
      coalesce(sum(d.amount) filter (where c.kind in ('regular','contractor')),0) khata_amount,
      coalesce(sum(d.amount) filter (where c.kind='cash'),0) cash_sale_amount
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id where d.delivery_date=p_date
  ), dispositions as (
    select coalesce(sum(litres) filter (where disposition_type='free'),0) free_litres,
      coalesce(sum(litres) filter (where disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(litres) filter (where disposition_type='wastage'),0) wasted_litres,
      coalesce(sum(litres),0) total_litres
    from public.milk_dispositions where milk_date=p_date
  ), collections as (
    select coalesce(sum(p.amount),0) amount
    from public.payments p join public.milk_deliveries d on d.id=p.delivery_id
      join public.customers c on c.id=d.customer_id
    where d.delivery_date=p_date and c.kind='cash'
  )
  select p_date,o.litres,p.litres,o.litres+p.litres,d.khata_litres,d.cash_litres,
    d.legacy_free_litres+x.free_litres,x.farm_use_litres,x.wasted_litres,
    d.total_litres+x.total_litres,o.litres+p.litres-d.total_litres-x.total_litres,
    d.khata_amount,d.cash_sale_amount,c.amount
  from opening o cross join production p cross join deliveries d cross join dispositions x cross join collections c;
end $$;

create function public.milk_shift_distribution_summary(p_date date)
returns table (
  milk_shift text, produced_litres numeric, khata_litres numeric, cash_litres numeric,
  free_litres numeric, farm_use_litres numeric, wasted_litres numeric, allocated_litres numeric,
  remaining_litres numeric, khata_amount numeric, cash_sale_amount numeric, cash_received numeric
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_date is null or p_date > public.farm_today() then raise exception 'REPORT_PERIOD_INVALID'; end if;
  return query with shifts as (
    select s.id, s.shift, s.total_litres from public.milk_shifts s where s.milk_date=p_date
  ), deliveries as (
    select d.shift,
      coalesce(sum(d.litres) filter (where c.kind in ('regular','contractor','company')),0) khata_litres,
      coalesce(sum(d.litres) filter (where c.kind='cash'),0) cash_litres,
      coalesce(sum(d.litres) filter (where c.kind='free'),0) legacy_free_litres,
      coalesce(sum(d.litres),0) total_litres,
      coalesce(sum(d.amount) filter (where c.kind in ('regular','contractor')),0) khata_amount,
      coalesce(sum(d.amount) filter (where c.kind='cash'),0) cash_sale_amount
    from public.milk_deliveries d join public.customers c on c.id=d.customer_id
    where d.delivery_date=p_date group by d.shift
  ), dispositions as (
    select md.shift_id,
      coalesce(sum(md.litres) filter (where md.disposition_type='free'),0) free_litres,
      coalesce(sum(md.litres) filter (where md.disposition_type='internal'),0) farm_use_litres,
      coalesce(sum(md.litres) filter (where md.disposition_type='wastage'),0) wasted_litres,
      coalesce(sum(md.litres),0) total_litres
    from public.milk_dispositions md where md.milk_date=p_date and md.shift_id is not null group by md.shift_id
  ), collections as (
    select d.shift, coalesce(sum(pay.amount),0) amount
    from public.payments pay join public.milk_deliveries d on d.id=pay.delivery_id
      join public.customers c on c.id=d.customer_id
    where d.delivery_date=p_date and c.kind='cash' group by d.shift
  )
  select s.shift,s.total_litres,coalesce(d.khata_litres,0),coalesce(d.cash_litres,0),
    coalesce(d.legacy_free_litres,0)+coalesce(x.free_litres,0),coalesce(x.farm_use_litres,0),coalesce(x.wasted_litres,0),
    coalesce(d.total_litres,0)+coalesce(x.total_litres,0),
    s.total_litres-coalesce(d.total_litres,0)-coalesce(x.total_litres,0),
    coalesce(d.khata_amount,0),coalesce(d.cash_sale_amount,0),coalesce(c.amount,0)
  from shifts s left join deliveries d on d.shift=s.shift left join dispositions x on x.shift_id=s.id
    left join collections c on c.shift=s.shift
  order by case s.shift when 'morning' then 1 when 'noon' then 2 else 3 end;
end $$;

revoke all on public.milk_dispositions from public, anon, authenticated;
grant select, insert, update, delete on public.milk_dispositions to authenticated;
revoke all on function public.save_milk_day_waste(date,numeric,text), public.save_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text), public.correct_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text,text), public.milk_report_date_bounds(), public.milk_report_daily(date,date), public.milk_report_summary(date,date), public.milk_day_distribution_summary(date), public.milk_shift_distribution_summary(date) from public, anon, authenticated;
grant execute on function public.save_milk_day_waste(date,numeric,text), public.save_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text), public.milk_report_date_bounds(), public.milk_report_daily(date,date), public.milk_report_summary(date,date), public.milk_day_distribution_summary(date), public.milk_shift_distribution_summary(date) to authenticated;
grant execute on function public.correct_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    create policy demo_all on public.milk_dispositions for all to anon
      using ((select private.demo_access_enabled())) with check ((select private.demo_access_enabled()));
    grant select, insert, update, delete on public.milk_dispositions to anon;
    grant execute on function public.save_milk_day_waste(date,numeric,text), public.save_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text), public.correct_milk_entry_with_dispositions(date,text,numeric,text,jsonb,jsonb,jsonb,timestamptz,text,text), public.milk_report_date_bounds(), public.milk_report_daily(date,date), public.milk_report_summary(date,date), public.milk_day_distribution_summary(date), public.milk_shift_distribution_summary(date) to anon;
  end if;
end $$;
