-- ═══════════════════════════════════════════════════════════════════
-- Reports. Every screen that shows a balance or total MUST call these,
-- never re-calculate in TypeScript. p_month = any day in the month.
-- ═══════════════════════════════════════════════════════════════════

-- ── Customer khata for a month (client sheet: left table) ──────────
-- Columns map 1:1 to the client's sheet:
--   litres=Kul doodh, amount=Kul raqam, previous_balance=Sabiqa baqaya,
--   total=Total, paid=Ada shuda, balance=Total baqaya jo lene hain
create or replace function customer_month_report(p_month date)
returns table (
  customer_id uuid, name text, kind text, free_reason text, sort_order int, active boolean,
  litres numeric, amount numeric, previous_balance numeric, total numeric,
  paid numeric, discount numeric, balance numeric)
language sql stable as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  ),
  d as (   -- deliveries
    select customer_id,
      sum(litres) filter (where delivery_date >= b.m_start and delivery_date < b.m_end) as litres_m,
      sum(amount) filter (where delivery_date >= b.m_start and delivery_date < b.m_end) as amount_m,
      sum(amount) filter (where delivery_date <  b.m_start) as amount_before
    from milk_deliveries, b group by customer_id
  ),
  cb as (  -- company bills (counted in the month of to_date)
    select customer_id,
      sum(amount) filter (where to_date >= b.m_start and to_date < b.m_end) as amount_m,
      sum(amount) filter (where to_date <  b.m_start) as amount_before
    from company_bills, b group by customer_id
  ),
  p as (   -- payments + discounts
    select customer_id,
      sum(amount) filter (where kind = 'payment'  and payment_date >= b.m_start and payment_date < b.m_end) as paid_m,
      sum(amount) filter (where kind = 'discount' and payment_date >= b.m_start and payment_date < b.m_end) as disc_m,
      sum(amount) filter (where payment_date < b.m_start) as paid_before
    from payments, b group by customer_id
  ),
  r as (
    select c.id, c.name, c.kind, c.free_reason, c.sort_order, c.active,
      coalesce(d.litres_m, 0) as litres,
      coalesce(d.amount_m, 0) + coalesce(cb.amount_m, 0) as amount,
      case when c.opening_date < b.m_end then c.opening_balance else 0 end
        + coalesce(d.amount_before, 0) + coalesce(cb.amount_before, 0)
        - coalesce(p.paid_before, 0) as previous_balance,
      coalesce(p.paid_m, 0) as paid,
      coalesce(p.disc_m, 0) as discount
    from customers c cross join b
    left join d  on d.customer_id  = c.id
    left join cb on cb.customer_id = c.id
    left join p  on p.customer_id  = c.id
  )
  select id, name, kind, free_reason, sort_order, active,
         litres, amount, previous_balance,
         previous_balance + amount as total,
         paid, discount,
         previous_balance + amount - paid - discount as balance
  from r
  where active or litres <> 0 or amount <> 0 or paid <> 0 or previous_balance <> 0
  order by case kind when 'regular' then 1 when 'cash' then 2 when 'contractor' then 3
                     when 'company' then 4 else 5 end, sort_order, name
$$;

-- ── Current balance of every customer (all time) ───────────────────
create or replace view customer_balances as
select c.id as customer_id, c.name, c.kind,
       c.opening_balance
       + coalesce((select sum(amount) from milk_deliveries d where d.customer_id = c.id), 0)
       + coalesce((select sum(amount) from company_bills  b where b.customer_id = c.id), 0)
       - coalesce((select sum(amount) from payments       p where p.customer_id = c.id), 0) as balance,
       (select max(payment_date) from payments p where p.customer_id = c.id and p.kind = 'payment') as last_payment_date
from customers c;
alter view customer_balances set (security_invoker = true);

-- ── Milk produced vs delivered (sheet: bottom "Total 10228") ───────
create or replace function milk_month_summary(p_month date)
returns table (produced numeric, sold_litres numeric, free_litres numeric,
               delivered numeric, difference numeric, company_slip_litres numeric)
language sql stable as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  ),
  prod as (select coalesce(sum(total_litres), 0) as v from milk_shifts, b
           where milk_date >= b.m_start and milk_date < b.m_end),
  dl as (
    select coalesce(sum(d.litres) filter (where c.kind <> 'free'), 0) as sold,
           coalesce(sum(d.litres) filter (where c.kind =  'free'), 0) as free
    from milk_deliveries d join customers c on c.id = d.customer_id, b
    where d.delivery_date >= b.m_start and d.delivery_date < b.m_end
  ),
  slip as (select coalesce(sum(litres), 0) as v from company_bills, b
           where to_date >= b.m_start and to_date < b.m_end)
  select prod.v, dl.sold, dl.free, dl.sold + dl.free, prod.v - (dl.sold + dl.free), slip.v
  from prod, dl, slip
$$;

-- ── Expenses for a month (sheet: "Tafseel / Kharch") ───────────────
create or replace function expense_month_report(p_month date)
returns table (label text, category_id uuid, category text, staff_id uuid, staff_name text,
               is_farm_cost boolean, amount numeric, sort_order int)
language sql stable as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  )
  select case when s.name is not null then ec.name || ': ' || s.name else ec.name end,
         ec.id, ec.name, s.id, s.name, ec.is_farm_cost, sum(e.amount), ec.sort_order
  from expenses e
  join expense_categories ec on ec.id = e.category_id
  left join staff s on s.id = e.staff_id
  cross join b
  where e.expense_date >= b.m_start and e.expense_date < b.m_end
  group by ec.id, ec.name, s.id, s.name, ec.is_farm_cost, ec.sort_order
  order by ec.is_farm_cost desc, ec.sort_order, ec.name, s.name
$$;

-- ── Profit / loss (sheet: Total kharch vs Kul raqam -> Nuqsan) ─────
create or replace function pnl_month(p_month date)
returns table (milk_income numeric, other_income numeric, total_income numeric,
               farm_expenses numeric, personal_expenses numeric, profit numeric)
language sql stable as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  ),
  mi as (
    select (select coalesce(sum(amount),0) from milk_deliveries, b
            where delivery_date >= b.m_start and delivery_date < b.m_end)
         + (select coalesce(sum(amount),0) from company_bills, b
            where to_date >= b.m_start and to_date < b.m_end) as v
  ),
  oi as (select coalesce(sum(amount),0) as v from other_income, b
         where income_date >= b.m_start and income_date < b.m_end),
  ex as (
    select coalesce(sum(e.amount) filter (where ec.is_farm_cost), 0) as farm,
           coalesce(sum(e.amount) filter (where not ec.is_farm_cost), 0) as personal
    from expenses e join expense_categories ec on ec.id = e.category_id, b
    where e.expense_date >= b.m_start and e.expense_date < b.m_end
  )
  select mi.v, oi.v, mi.v + oi.v, ex.farm, ex.personal, mi.v + oi.v - ex.farm
  from mi, oi, ex
$$;

-- ── Account / galla book (sheet: "Rozana wusool hone wale paison ki tafseel")
create or replace function account_entries(p_account uuid)
returns table (entry_date date, entry_kind text, description text, money_in numeric, money_out numeric, ref_id uuid)
language sql stable as $$
  select p.payment_date, 'payment', 'Wusooli: ' || c.name, p.amount, 0::numeric, p.id
    from payments p join customers c on c.id = p.customer_id
   where p.account_id = p_account and p.kind = 'payment'
  union all
  select o.income_date, 'other_income',
         case o.kind when 'animal_sale' then 'Janwar farokht' when 'manure' then 'Gobar' else 'Doosri aamdan' end
           || coalesce(': ' || o.note, ''), o.amount, 0, o.id
    from other_income o where o.account_id = p_account
  union all
  select t.transfer_date, 'transfer_in', 'Mila: ' || a.name || coalesce(' (' || t.note || ')', ''), t.amount, 0, t.id
    from transfers t join accounts a on a.id = t.from_account_id where t.to_account_id = p_account
  union all
  select t.transfer_date, 'transfer_out', 'Diya: ' || a.name || coalesce(' (' || t.note || ')', ''), 0, t.amount, t.id
    from transfers t join accounts a on a.id = t.to_account_id where t.from_account_id = p_account
  union all
  select e.expense_date, 'expense', 'Kharcha: ' || ec.name || coalesce(' (' || e.note || ')', ''), 0, e.amount, e.id
    from expenses e join expense_categories ec on ec.id = e.category_id where e.account_id = p_account
$$;

create or replace function account_month_summary(p_month date)
returns table (account_id uuid, name text, kind text, is_farm_cash boolean,
               opening numeric, money_in numeric, money_out numeric, closing numeric)
language sql stable as $$
  with b as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end
  )
  select a.id, a.name, a.kind, a.is_farm_cash,
    o.opening, f.money_in, f.money_out, o.opening + f.money_in - f.money_out
  from accounts a cross join b
  cross join lateral (
    select coalesce(sum(money_in)  filter (where entry_date >= b.m_start and entry_date < b.m_end), 0) as money_in,
           coalesce(sum(money_out) filter (where entry_date >= b.m_start and entry_date < b.m_end), 0) as money_out,
           coalesce(sum(money_in - money_out) filter (where entry_date < b.m_start), 0) as net_before
    from account_entries(a.id)) f
  cross join lateral (
    select case when a.opening_date < b.m_end then a.opening_balance else 0 end + f.net_before as opening) o
  where a.active or f.money_in <> 0 or f.money_out <> 0
  order by a.is_farm_cash desc, a.sort_order, a.name
$$;

-- ── Herd status (one row per active animal) ────────────────────────
create or replace view animal_status as
select a.id, a.tag, a.name, a.species, a.breed, a.sex, a.category, a.milking_status,
       a.birth_date, a.mother_id,
       i.id as insemination_id, i.service_date, i.semen_type, i.semen_name, i.status as insem_status,
       i.ultrasound_due, i.checkup_due, i.dry_off_due, i.calving_due,
       lc.calving_date as last_calving_date,
       case
         when a.sex = 'male' or a.category = 'calf' then 'na'
         when i.status = 'pregnant' then 'pregnant'
         when i.status = 'pending'  then 'inseminated'
         when lc.calving_date is not null
              and lc.calving_date >= farm_today() - (select fresh_days from settings where id = 1) then 'fresh'
         else 'open'
       end as breeding_status,
       case when a.milking_status = 'milking' and lc.calving_date is not null
            then farm_today() - lc.calving_date end as days_in_milk
from animals a
left join lateral (
  select * from inseminations x
  where x.animal_id = a.id and x.status in ('pending','pregnant')
  order by x.service_date desc limit 1) i on true
left join lateral (
  select c.calving_date from calvings c where c.animal_id = a.id
  order by c.calving_date desc limit 1) lc on true
where a.life_status = 'active';
alter view animal_status set (security_invoker = true);

-- ── Alerts for dashboard ("Tawajju dein") ──────────────────────────
-- severity: 'overdue' (date passed) | 'soon'
create or replace function herd_alerts(p_today date)
returns table (alert_kind text, severity text, due_date date, animal_id uuid, tag text, message text)
language sql stable as $$
  -- Ultrasound after insemination
  select 'ultrasound', case when i.ultrasound_due < p_today then 'overdue' else 'soon' end,
         i.ultrasound_due, a.id, a.tag,
         a.tag || ': ultrasound karwayein (tukhm-rezi ' || to_char(i.service_date, 'DD Mon') || ')'
  from inseminations i join animals a on a.id = i.animal_id
  where a.life_status = 'active' and i.status = 'pending' and i.ultrasound_date is null
    and i.ultrasound_due <= p_today + 3
  union all
  -- Checkup (75 days)
  select 'checkup', case when i.checkup_due < p_today then 'overdue' else 'soon' end,
         i.checkup_due, a.id, a.tag, a.tag || ': checkup ki tareekh'
  from inseminations i join animals a on a.id = i.animal_id
  where a.life_status = 'active' and i.status = 'pregnant' and i.checkup_date is null
    and i.checkup_due <= p_today + 3
  union all
  -- Dry off (210 days) while still milking
  select 'dry_off', case when i.dry_off_due < p_today then 'overdue' else 'soon' end,
         i.dry_off_due, a.id, a.tag, a.tag || ': khushk karne ka waqt'
  from inseminations i join animals a on a.id = i.animal_id
  where a.life_status = 'active' and i.status = 'pregnant' and a.milking_status = 'milking'
    and i.dry_off_due <= p_today + 7
  union all
  -- Calving (270 days)
  select 'calving', case when i.calving_due < p_today then 'overdue' else 'soon' end,
         i.calving_due, a.id, a.tag,
         case when i.calving_due < p_today
              then a.tag || ': bachha dene ki tareekh ' || (p_today - i.calving_due) || ' din pehle guzar gayi'
              else a.tag || ': ' || (i.calving_due - p_today) || ' din mein bachha mutawaqqa' end
  from inseminations i join animals a on a.id = i.animal_id
  where a.life_status = 'active' and i.status = 'pregnant' and i.calving_due <= p_today + 30
  union all
  -- Vaccine / medicine next due (only latest event of that title per animal)
  select 'health', case when h.next_due_date < p_today then 'overdue' else 'soon' end,
         h.next_due_date, a.id, a.tag, a.tag || ': ' || h.title || ' dobara due'
  from health_events h join animals a on a.id = h.animal_id
  where a.life_status = 'active' and h.next_due_date is not null and h.next_due_date <= p_today + 7
    and not exists (select 1 from health_events h2
                    where h2.animal_id = h.animal_id and lower(h2.title) = lower(h.title)
                      and h2.event_date > h.event_date)
  order by 3, 5
$$;
