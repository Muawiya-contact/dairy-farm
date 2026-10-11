-- ═══════════════════════════════════════════════════════════════════
-- Dairy Farm App — core schema
-- Rules:
--   * Business dates are `date` (farm day in Asia/Karachi), never timestamps.
--   * Money  = numeric(12,2) rupees.  Litres = numeric(10,2).
--   * Money logic lives in the DB (triggers + report functions in 0002),
--     so the app screens and the monthly report can never disagree.
-- ═══════════════════════════════════════════════════════════════════

-- Farm day in Pakistan. Supabase's current_date is the UTC day (wrong 00:00-05:00 PKT).
create or replace function farm_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Karachi')::date $$;

-- ── Settings (single row) ──────────────────────────────────────────
create table settings (
  id               int primary key default 1 check (id = 1),
  farm_name        text not null default 'Dairy Farm',
  owner_name       text not null default '',
  go_live_date     date not null default farm_today(),
  default_milk_rate numeric(10,2) not null default 150 check (default_milk_rate > 0),
  -- Breeding offsets in days after insemination (from client's semen sheet)
  ultrasound_days  int not null default 30  check (ultrasound_days  between 1 and 400),
  checkup_days     int not null default 75  check (checkup_days     between 1 and 400),
  dry_off_days     int not null default 210 check (dry_off_days     between 1 and 400),
  calving_days     int not null default 270 check (calving_days     between 200 and 320),
  fresh_days       int not null default 60  check (fresh_days       between 1 and 200),
  whatsapp_footer  text not null default 'Shukriya'
);
insert into settings (id) values (1);

-- ── Accounts: where money sits (farm galla, owners' pockets, bank) ─
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            text not null check (kind in ('cash','person','bank')),
  is_farm_cash    boolean not null default false,
  opening_balance numeric(12,2) not null default 0,
  opening_date    date not null default farm_today(),
  active          boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create unique index accounts_name_uq on accounts (lower(name));
create unique index accounts_one_farm_cash on accounts (is_farm_cash) where is_farm_cash;

-- ── Animals ────────────────────────────────────────────────────────
create table animals (
  id             uuid primary key default gen_random_uuid(),
  tag            text not null check (length(trim(tag)) > 0),
  name           text,
  species        text not null default 'cow' check (species in ('cow','buffalo')),
  breed          text,
  sex            text not null default 'female' check (sex in ('female','male')),
  category       text not null default 'cow' check (category in ('cow','heifer','calf','bull')),
  birth_date     date,
  mother_id      uuid references animals(id) on delete set null,
  sire           text,                       -- semen / bull name the calf came from
  source         text not null default 'purchased' check (source in ('born','purchased')),
  purchase_date  date,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  milking_status text not null default 'none' check (milking_status in ('milking','dry','none')),
  life_status    text not null default 'active' check (life_status in ('active','sold','dead')),
  exit_date      date,
  exit_reason    text,
  sale_price     numeric(12,2) check (sale_price is null or sale_price >= 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint animals_exit_ok check (
    (life_status = 'active' and exit_date is null)
    or (life_status <> 'active' and exit_date is not null)),
  constraint animals_birth_before_exit check (birth_date is null or exit_date is null or birth_date <= exit_date),
  constraint animals_not_own_mother check (mother_id is null or mother_id <> id),
  constraint animals_male_not_milking check (sex = 'female' or milking_status = 'none')
);
-- A tag can be re-used only after the old animal is sold/dead.
create unique index animals_active_tag_uq on animals (lower(trim(tag))) where life_status = 'active';

-- ── Breeding: one row per insemination (client's "Semon" sheet) ────
create table inseminations (
  id               uuid primary key default gen_random_uuid(),
  animal_id        uuid not null references animals(id) on delete restrict,
  service_date     date not null,
  semen_type       text not null default 'normal' check (semen_type in ('normal','sexed','bull')),
  semen_name       text,                      -- Irishman, Dolce, Sedona 840, Holetown, Dekalb...
  technician       text,
  -- Due dates are frozen at insert from settings (changing settings later
  -- must not silently move old records).
  ultrasound_due   date not null,
  checkup_due      date not null,
  dry_off_due      date not null,
  calving_due      date not null,
  ultrasound_date  date,
  ultrasound_result text check (ultrasound_result in ('pregnant','empty')),
  checkup_date     date,
  checkup_result   text check (checkup_result in ('pregnant','empty')),
  status           text not null default 'pending'
                   check (status in ('pending','pregnant','empty','aborted','calved')),
  abortion_date    date,
  notes            text,
  created_at       timestamptz not null default now(),
  constraint insem_dates_after_service check (
        (ultrasound_date is null or ultrasound_date >= service_date)
    and (checkup_date    is null or checkup_date    >= service_date)
    and (abortion_date   is null or abortion_date   >= service_date)),
  constraint insem_abortion_needs_date check ((status = 'aborted') = (abortion_date is not null))
);
-- Only one open (pending / pregnant) breeding per animal at a time.
create unique index insem_one_open_per_animal on inseminations (animal_id) where status in ('pending','pregnant');

create table calvings (
  id               uuid primary key default gen_random_uuid(),
  animal_id        uuid not null references animals(id) on delete restrict,
  calving_date     date not null,
  insemination_id  uuid references inseminations(id) on delete set null,
  outcome          text not null default 'alive' check (outcome in ('alive','dead','twins')),
  calf_id          uuid references animals(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);
create unique index calvings_one_per_insem on calvings (insemination_id) where insemination_id is not null;

-- ── Health ─────────────────────────────────────────────────────────
create table health_events (
  id            uuid primary key default gen_random_uuid(),
  animal_id     uuid not null references animals(id) on delete restrict,
  event_date    date not null,
  kind          text not null check (kind in ('vaccine','treatment','deworming','checkup','other')),
  title         text not null,
  medicine      text,
  vet           text,
  cost          numeric(12,2) not null default 0 check (cost >= 0),
  next_due_date date,
  expense_id    uuid,                 -- set when "kharche mein bhi daalein" is ticked
  notes         text,
  created_at    timestamptz not null default now(),
  constraint health_next_after check (next_due_date is null or next_due_date >= event_date)
);

-- ── Customers & rates ──────────────────────────────────────────────
create table customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  phone            text,
  -- regular   = monthly khata (Shaukat, Munawar...)
  -- contractor= bulk buyer / doodh wala (Haider)
  -- company   = Nestle etc. Money comes from their bill slip, not litres x rate
  -- cash      = "Naqd" walk-in sale, paid on the spot
  -- free      = no money: owners' homes, workers, Allah ke naam, bachhre
  kind             text not null check (kind in ('regular','contractor','company','cash','free')),
  free_reason      text check (free_reason in ('owner','staff','charity','calves','other')),
  default_morning  numeric(10,2) not null default 0 check (default_morning >= 0),
  default_evening  numeric(10,2) not null default 0 check (default_evening >= 0),
  opening_balance  numeric(12,2) not null default 0,
  opening_date     date not null default farm_today(),
  active           boolean not null default true,
  sort_order       int not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  constraint customers_free_reason check ((kind = 'free') = (free_reason is not null)),
  constraint customers_no_balance_for_free check (kind not in ('free','cash') or opening_balance = 0)
);
create unique index customers_name_uq on customers (lower(trim(name)));

create table customer_rates (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  rate           numeric(10,2) not null check (rate > 0),
  effective_from date not null,
  unique (customer_id, effective_from)
);

-- ── Milk: production per shift ─────────────────────────────────────
create table milk_shifts (
  id           uuid primary key default gen_random_uuid(),
  milk_date    date not null,
  shift        text not null check (shift in ('morning','evening')),
  total_litres numeric(10,2) not null check (total_litres >= 0 and total_litres <= 5000),
  mode         text not null default 'total' check (mode in ('total','per_animal')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (milk_date, shift)
);

create table animal_milk (
  id        uuid primary key default gen_random_uuid(),
  shift_id  uuid not null references milk_shifts(id) on delete cascade,
  animal_id uuid not null references animals(id) on delete restrict,
  litres    numeric(6,2) not null check (litres >= 0 and litres <= 60),
  unique (shift_id, animal_id)
);

-- ── Milk: where it went ────────────────────────────────────────────
create table milk_deliveries (
  id            uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  shift         text not null check (shift in ('morning','evening')),
  customer_id   uuid not null references customers(id) on delete restrict,
  litres        numeric(10,2) not null check (litres >= 0 and litres <= 3000),
  rate          numeric(10,2),          -- snapshot; filled by trigger
  amount        numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (delivery_date, shift, customer_id)
);

-- Company (Nestle) money comes from their slip for a period.
create table company_bills (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  from_date   date not null,
  to_date     date not null,
  litres      numeric(10,2) not null check (litres >= 0),   -- litres as per THEIR slip
  amount      numeric(12,2) not null check (amount >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  constraint company_bill_range check (to_date >= from_date)
);

-- ── Money in ───────────────────────────────────────────────────────
create table payments (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete restrict,
  payment_date date not null,
  amount       numeric(12,2) not null check (amount > 0),
  kind         text not null default 'payment' check (kind in ('payment','discount')),
  method       text check (method in ('cash','bank','easypaisa','jazzcash','cheque')),
  account_id   uuid references accounts(id) on delete restrict,
  delivery_id  uuid unique references milk_deliveries(id) on delete cascade,  -- auto payment for "Naqd"
  note         text,
  created_at   timestamptz not null default now(),
  constraint payment_needs_account check (kind = 'discount' or (account_id is not null and method is not null)),
  constraint discount_no_account  check (kind = 'payment'  or account_id is null)
);

create table other_income (
  id          uuid primary key default gen_random_uuid(),
  income_date date not null,
  kind        text not null check (kind in ('animal_sale','manure','other')),
  amount      numeric(12,2) not null check (amount > 0),
  account_id  uuid not null references accounts(id) on delete restrict,
  animal_id   uuid references animals(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

-- Cash moving between pockets (farm galla -> Jahangir Sahab etc.)
create table transfers (
  id              uuid primary key default gen_random_uuid(),
  transfer_date   date not null,
  from_account_id uuid not null references accounts(id) on delete restrict,
  to_account_id   uuid not null references accounts(id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  note            text,
  created_at      timestamptz not null default now(),
  constraint transfer_diff_accounts check (from_account_id <> to_account_id)
);

-- ── Money out ──────────────────────────────────────────────────────
create table expense_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_farm_cost boolean not null default true,   -- false = personal (e.g. Dukan bill): not in profit/loss
  is_salary    boolean not null default false,
  active       boolean not null default true,
  sort_order   int not null default 0
);
create unique index expense_categories_name_uq on expense_categories (lower(name));

create table staff (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  role           text,
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  phone          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_id  uuid not null references expense_categories(id) on delete restrict,
  amount       numeric(12,2) not null check (amount > 0),
  account_id   uuid not null references accounts(id) on delete restrict,   -- paid from
  staff_id     uuid references staff(id) on delete restrict,
  quantity     numeric(10,2) check (quantity is null or quantity > 0),
  unit         text,                        -- bori, trolley, kg, mann
  note         text,
  created_at   timestamptz not null default now()
);
alter table health_events
  add constraint health_expense_fk foreign key (expense_id) references expenses(id) on delete set null;

-- ── Month lock ("maheena band") ────────────────────────────────────
create table month_locks (
  month     date primary key check (extract(day from month) = 1),
  locked_at timestamptz not null default now(),
  note      text
);

-- ═══════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════

-- Customer's rate on a given day (latest effective_from <= day)
create or replace function rate_on(p_customer uuid, p_day date) returns numeric
language sql stable as $$
  select rate from customer_rates
  where customer_id = p_customer and effective_from <= p_day
  order by effective_from desc limit 1
$$;

-- Fill breeding due dates from settings at insert
create or replace function trg_insem_due_dates() returns trigger language plpgsql as $$
declare s settings;
begin
  select * into s from settings where id = 1;
  if tg_op = 'INSERT' then
    new.ultrasound_due := new.service_date + s.ultrasound_days;
    new.checkup_due    := new.service_date + s.checkup_days;
    new.dry_off_due    := new.service_date + s.dry_off_days;
    new.calving_due    := new.service_date + s.calving_days;
  elsif new.service_date <> old.service_date then
    -- keep the offsets that were used when the row was created
    new.ultrasound_due := old.ultrasound_due + (new.service_date - old.service_date);
    new.checkup_due    := old.checkup_due    + (new.service_date - old.service_date);
    new.dry_off_due    := old.dry_off_due    + (new.service_date - old.service_date);
    new.calving_due    := old.calving_due    + (new.service_date - old.service_date);
  end if;
  return new;
end $$;
create trigger insem_due_dates before insert or update on inseminations
  for each row execute function trg_insem_due_dates();

-- Rate + amount snapshot on every delivery
create or replace function trg_delivery_amount() returns trigger language plpgsql as $$
declare k text;
begin
  select kind into k from customers where id = new.customer_id;
  if k in ('free','company') then
    new.rate := null;
    new.amount := 0;                 -- free: no money; company: money via company_bills
  else
    if tg_op = 'INSERT' then
      -- app may pass a one-off special rate; otherwise use the rate table
      new.rate := coalesce(new.rate, rate_on(new.customer_id, new.delivery_date));
    elsif new.delivery_date <> old.delivery_date or new.customer_id <> old.customer_id then
      new.rate := rate_on(new.customer_id, new.delivery_date);
    end if;
    if new.rate is null then
      raise exception 'RATE_MISSING: is customer ka rate set nahi (%).', new.delivery_date
        using errcode = 'P0001';
    end if;
    new.amount := round(new.litres * new.rate, 2);
  end if;
  return new;
end $$;
create trigger delivery_amount before insert or update on milk_deliveries
  for each row execute function trg_delivery_amount();

-- "Naqd" (cash) customer: payment is created/updated/removed automatically into farm galla
create or replace function trg_cash_delivery_payment() returns trigger language plpgsql as $$
declare k text; galla uuid;
begin
  select kind into k from customers where id = new.customer_id;
  if k <> 'cash' then return new; end if;
  select id into galla from accounts where is_farm_cash;
  if galla is null then raise exception 'NO_FARM_CASH: farm galla account nahi bana' using errcode = 'P0001'; end if;
  if new.amount = 0 then
    delete from payments where delivery_id = new.id;
  else
    insert into payments (customer_id, payment_date, amount, kind, method, account_id, delivery_id, note)
    values (new.customer_id, new.delivery_date, new.amount, 'payment', 'cash', galla, new.id, 'Naqd sale')
    on conflict (delivery_id) do update
      set amount = excluded.amount, payment_date = excluded.payment_date;
  end if;
  return new;
end $$;
create trigger cash_delivery_payment after insert or update on milk_deliveries
  for each row execute function trg_cash_delivery_payment();

-- Delivery customer kind must match: no company bills for non-company etc.
create or replace function trg_company_bill_check() returns trigger language plpgsql as $$
begin
  if (select kind from customers where id = new.customer_id) <> 'company' then
    raise exception 'NOT_COMPANY: bill sirf company customer ka ho sakta hai' using errcode = 'P0001';
  end if;
  if exists (select 1 from company_bills b
             where b.customer_id = new.customer_id and b.id <> new.id
               and b.from_date <= new.to_date and new.from_date <= b.to_date) then
    raise exception 'BILL_OVERLAP: in tareekhon ka bill pehle se hai' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger company_bill_check before insert or update on company_bills
  for each row execute function trg_company_bill_check();

-- Payments not allowed for free customers
create or replace function trg_payment_check() returns trigger language plpgsql as $$
begin
  if (select kind from customers where id = new.customer_id) = 'free' then
    raise exception 'FREE_CUSTOMER: muft doodh wale se wusooli nahi hoti' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payment_check before insert or update on payments
  for each row execute function trg_payment_check();

-- Per-animal mode: shift total = sum of animal litres
create or replace function trg_animal_milk_total() returns trigger language plpgsql as $$
declare sid uuid := coalesce(new.shift_id, old.shift_id);
begin
  update milk_shifts
     set total_litres = (select coalesce(sum(litres),0) from animal_milk where shift_id = sid),
         updated_at = now()
   where id = sid and mode = 'per_animal';
  return null;
end $$;
create trigger animal_milk_total after insert or update or delete on animal_milk
  for each row execute function trg_animal_milk_total();

-- Only active, female, milking animals can have milk
create or replace function trg_animal_milk_check() returns trigger language plpgsql as $$
declare a animals; d date;
begin
  select * into a from animals where id = new.animal_id;
  select milk_date into d from milk_shifts where id = new.shift_id;
  -- a sold/dead cow can still have milk on days BEFORE she left (editing old shifts)
  if a.sex <> 'female' or (a.life_status <> 'active' and a.exit_date <= d) then
    raise exception 'ANIMAL_NOT_MILKING: % ka doodh nahi likha ja sakta', a.tag using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger animal_milk_check before insert or update on animal_milk
  for each row execute function trg_animal_milk_check();

-- Month lock: block insert/update/delete of rows dated in a locked month.
-- TG_ARGV[0] = name of the date column.
create or replace function trg_month_lock() returns trigger language plpgsql as $$
declare d_new date; d_old date;
begin
  if tg_op <> 'DELETE' then d_new := (to_jsonb(new) ->> tg_argv[0])::date; end if;
  if tg_op <> 'INSERT' then d_old := (to_jsonb(old) ->> tg_argv[0])::date; end if;
  if exists (select 1 from month_locks m
             where m.month = date_trunc('month', d_new)::date
                or m.month = date_trunc('month', d_old)::date) then
    raise exception 'MONTH_LOCKED: yeh maheena band hai, pehle kholein' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger lock_milk_shifts     before insert or update or delete on milk_shifts     for each row execute function trg_month_lock('milk_date');
create trigger lock_milk_deliveries before insert or update or delete on milk_deliveries for each row execute function trg_month_lock('delivery_date');
create trigger lock_payments        before insert or update or delete on payments        for each row execute function trg_month_lock('payment_date');
create trigger lock_expenses        before insert or update or delete on expenses        for each row execute function trg_month_lock('expense_date');
create trigger lock_transfers       before insert or update or delete on transfers       for each row execute function trg_month_lock('transfer_date');
create trigger lock_other_income    before insert or update or delete on other_income    for each row execute function trg_month_lock('income_date');
create trigger lock_company_bills   before insert or update or delete on company_bills   for each row execute function trg_month_lock('to_date');

-- updated_at
create or replace function trg_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
create trigger animals_touch     before update on animals     for each row execute function trg_touch();
create trigger milk_shifts_touch before update on milk_shifts for each row execute function trg_touch();

-- Useful indexes
create index deliveries_date_idx   on milk_deliveries (delivery_date);
create index deliveries_cust_idx   on milk_deliveries (customer_id, delivery_date);
create index payments_cust_idx     on payments (customer_id, payment_date);
create index expenses_date_idx     on expenses (expense_date);
create index insem_animal_idx      on inseminations (animal_id, service_date desc);
create index health_animal_idx     on health_events (animal_id, event_date desc);
create index health_due_idx        on health_events (next_due_date) where next_due_date is not null;

-- Keep all new tables closed between this migration and the owner policy.
-- The owner policy is added only after report functions and views are ready.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','accounts','animals','inseminations','calvings','health_events',
    'customers','customer_rates','milk_shifts','animal_milk','milk_deliveries',
    'company_bills','payments','other_income','transfers','expense_categories',
    'staff','expenses','month_locks'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
