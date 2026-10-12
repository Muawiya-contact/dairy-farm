-- ═══════════════════════════════════════════════════════════════════
-- DEMO DATA for the STAGING Supabase project (never production).
-- Run once on a fresh staging project, after all migrations. Generic
-- accounts/categories are already in migration 000004. All dates use farm_today(),
-- so the demo always looks "fresh": last 14 days of milk, alerts due soon, etc.
-- Safe numbers to check by hand (see tests/db/dev-demo.test.ts):
--   * milk produced = milk delivered every day (farq 0)
--   * Farm galla balance today = Rs 7,500
-- ═══════════════════════════════════════════════════════════════════

begin;

update settings set farm_name = 'Demo Dairy Farm', owner_name = 'Demo Owner',
  go_live_date = farm_today() - 30 where id = 1;
update accounts set opening_date = farm_today() - 30;
update accounts set opening_balance = 5000 where is_farm_cash;
insert into accounts (name, kind, opening_date, sort_order)
values ('Jahangir Sahab', 'person', farm_today() - 30, 2);

-- ── Customers ──────────────────────────────────────────────────────
insert into customers (name, kind, free_reason, phone, default_morning, default_evening, opening_balance, opening_date, sort_order) values
  ('Ahmed',        'regular',    null,     null, 5,  5,  12000, farm_today() - 30, 1),
  ('Bilal Hotel',  'regular',    null,     null, 10, 10, 0,     farm_today() - 30, 2),
  ('Naqd',         'cash',       null,     null,          3,  2,  0,     farm_today() - 30, 3),
  ('Rana Sweets',  'contractor', null,     null, 20, 15, 25000, farm_today() - 30, 4),
  ('Nestle',       'company',    null,     null,          0,  0,  0,     farm_today() - 30, 5),
  ('Ghar',         'free',       'owner',  null,          2,  2,  0,     farm_today() - 30, 6),
  ('Bachhre',      'free',       'calves', null,          4,  4,  0,     farm_today() - 30, 7);

insert into customer_rates (customer_id, rate, effective_from)
select id, 150, farm_today() - 60 from customers where kind in ('regular','cash','contractor');

-- ── Animals ────────────────────────────────────────────────────────
insert into animals (tag, breed, category, milking_status, source, purchase_date, purchase_price, birth_date)
select t::text, 'Holstein', 'cow', 'milking', 'purchased', farm_today() - 400, 350000, farm_today() - 365 * 4
from generate_series(101, 110) t;

insert into animals (tag, breed, category, milking_status, source, birth_date) values
  ('201', 'Holstein', 'heifer', 'none', 'born', farm_today() - 450),
  ('202', 'Holstein', 'heifer', 'none', 'born', farm_today() - 420);

insert into animals (tag, breed, sex, category, milking_status, source, birth_date, mother_id)
select v.tag, 'Holstein', v.sex, 'calf', 'none', 'born', farm_today() - v.age, m.id
from (values ('301', 'female', 90, '101'), ('302', 'male', 60, '102')) v(tag, sex, age, mother)
join animals m on m.tag = v.mother;

insert into calvings (animal_id, calving_date, outcome)
select id, farm_today() - 90, 'alive' from animals where tag = '101';
insert into calvings (animal_id, calving_date, outcome)
select id, farm_today() - 60, 'alive' from animals where tag = '102';

-- Breeding: 103 calving soon, 104 ultrasound overdue, 105 just inseminated
insert into inseminations (animal_id, service_date, semen_type, semen_name, status, ultrasound_date, ultrasound_result, checkup_date, checkup_result)
select id, farm_today() - 255, 'sexed', 'Holetown', 'pregnant',
       farm_today() - 225, 'pregnant', farm_today() - 180, 'pregnant'
from animals where tag = '103';
update animals set milking_status = 'dry' where tag = '103';   -- dried off at ~210 days
insert into inseminations (animal_id, service_date, semen_type)
select id, farm_today() - 40, 'normal' from animals where tag = '104';
insert into inseminations (animal_id, service_date, semen_type, semen_name)
select id, farm_today() - 10, 'sexed', 'Dolce' from animals where tag = '105';

-- Vaccine due again in 5 days for cow 106
insert into health_events (animal_id, event_date, kind, title, next_due_date)
select id, farm_today() - 175, 'vaccine', 'Mun-khur (FMD)', farm_today() + 5 from animals where tag = '106';

-- ── Milk: last 14 days (not today), 80 L morning + 70 L evening ────
insert into milk_shifts (milk_date, shift, total_litres)
select d::date, s.shift, case s.shift when 'morning' then 80 else 70 end
from generate_series(farm_today() - 14, farm_today() - 1, interval '1 day') d
cross join (values ('morning'), ('evening')) s(shift);

-- Everyone gets their default; Nestle takes the rest (36 morning, 32 evening) => farq 0
insert into milk_deliveries (delivery_date, shift, customer_id, litres)
select ms.milk_date, ms.shift, c.id,
       case when c.kind = 'company' then case ms.shift when 'morning' then 36 else 32 end
            when ms.shift = 'morning' then c.default_morning else c.default_evening end
from milk_shifts ms cross join customers c
where (c.kind = 'company') or (case ms.shift when 'morning' then c.default_morning else c.default_evening end) > 0;

-- Nestle slip for the first 7 days: 7 x 68 = 476 L at ~Rs 132
insert into company_bills (customer_id, from_date, to_date, litres, amount)
select id, farm_today() - 14, farm_today() - 8, 476, 62832 from customers where name = 'Nestle';

-- ── Money ──────────────────────────────────────────────────────────
insert into payments (customer_id, payment_date, amount, method, account_id)
select c.id, farm_today() - 5, 10000, 'cash', a.id
from customers c, accounts a where c.name = 'Ahmed' and a.is_farm_cash;
insert into payments (customer_id, payment_date, amount, method, account_id)
select c.id, farm_today() - 3, 30000, 'bank', a.id
from customers c, accounts a where c.name = 'Rana Sweets' and a.name = 'Jahangir Sahab';

insert into staff (name, role, monthly_salary) values ('Ismail', 'Worker', 25000);

insert into expenses (expense_date, category_id, amount, account_id, staff_id, quantity, unit, note)
select farm_today() - v.days_ago, ec.id, v.amount, a.id, s.id, v.qty, v.unit, v.note
from (values
  (10, 'Wanda',           21000, 'Jahangir Sahab', null,     10, 'bori', '10 bori wanda'),
  (8,  'Bijli bill',      12000, 'Jahangir Sahab', null,     null, null, 'Bijli ka bill'),
  (2,  'Farm ka kharcha',  3000, 'Farm galla',     null,     null, null, 'Chhota mota saman'),
  (1,  'Tankhwah',        25000, 'Jahangir Sahab', 'Ismail', null, null, 'Tankhwah')
) v(days_ago, cat, amount, acct, staff, qty, unit, note)
join expense_categories ec on ec.name = v.cat
join accounts a on a.name = v.acct
left join staff s on s.name = v.staff;

insert into transfers (transfer_date, from_account_id, to_account_id, amount, note)
select farm_today() - 1, f.id, t.id, 15000, 'Hafte ka cash'
from accounts f, accounts t where f.is_farm_cash and t.name = 'Jahangir Sahab';

commit;
