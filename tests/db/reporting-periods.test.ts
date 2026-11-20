import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  await db.exec(`
    update accounts set opening_date = '2026-10-01';
    insert into customers(name, kind, free_reason, opening_date) values
      ('Buyer', 'regular', null, '2026-10-01'), ('Charity', 'free', 'charity', '2026-10-01');
    insert into customers(name, kind, free_reason, opening_date, opening_balance, active) values
      ('Mid-period opening', 'regular', null, '2026-10-10', 500, false);
    insert into customer_rates(customer_id, rate, effective_from)
      select id, 150, '2026-10-01' from customers where name = 'Buyer';
    insert into milk_shifts(milk_date, shift, total_litres) values ('2026-10-10', 'morning', 10);
    insert into milk_deliveries(delivery_date, shift, customer_id, litres)
      select '2026-10-10', 'morning', id, case name when 'Buyer' then 4 else 2 end from customers where name in ('Buyer', 'Charity');
    insert into milk_shifts(milk_date, shift, total_litres) values ('2026-10-09', 'morning', 2);
    insert into milk_deliveries(delivery_date, shift, customer_id, litres)
      select '2026-10-09', 'morning', id, 2 from customers where name = 'Buyer';
    insert into animals(tag, name, arrival_date, milking_status) values
      ('MILK-1', 'Pehli gaay', '2026-10-01', 'milking'), ('MILK-2', 'Doosri gaay', '2026-10-01', 'milking');
    insert into milk_shifts(milk_date, shift, total_litres, mode) values
      ('2026-10-12', 'morning', 0, 'per_animal'), ('2026-10-12', 'noon', 0, 'per_animal'), ('2026-10-12', 'evening', 0, 'per_animal');
    insert into animal_milk(shift_id, animal_id, litres)
      select ms.id, a.id, case when a.tag = 'MILK-1' and ms.shift = 'morning' then 2.50
        when a.tag = 'MILK-1' and ms.shift = 'noon' then 1.50
        when a.tag = 'MILK-1' and ms.shift = 'evening' then 2.00 else 1.00 end
      from milk_shifts ms cross join animals a
      where ms.milk_date = '2026-10-12' and (a.tag = 'MILK-1' or (a.tag = 'MILK-2' and ms.shift = 'morning'));
    insert into payments(customer_id, payment_date, amount, kind, method, account_id)
      select c.id, '2026-10-10', 300, 'payment', 'cash', a.id from customers c cross join accounts a
      where c.name = 'Buyer' and a.is_farm_cash;
    insert into expenses(expense_date, category_id, account_id, amount, note)
      select '2026-10-10', c.id, a.id, 120.50, 'Feed' from expense_categories c cross join accounts a
      where c.name = 'Dawai / vet' and a.is_farm_cash;
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

test("period reports separate charity, billed sales, collections and farm costs", async () => {
  const row = (await db.query<Record<string, string>>("select * from report_period_summary('2026-10-10', '2026-10-10')")).rows[0];
  expect(row).toMatchObject({ produced: "10.00", delivered: "6.00", sold_litres: "4.00", free_litres: "2.00", milk_income: "600.00", cash_collected: "300.00", farm_expenses: "120.50", profit: "479.50" });
  const customers = (await db.query<Record<string, string>>("select name, litres, charged, paid, discount, period_balance_change from report_period_customers('2026-10-10', '2026-10-10') order by name")).rows;
  expect(customers).toEqual([
    { name: "Buyer", litres: "4.00", charged: "600.00", paid: "300.00", discount: "0", period_balance_change: "300.00" },
    { name: "Charity", litres: "2.00", charged: "0.00", paid: "0", discount: "0", period_balance_change: "0.00" },
  ]);
});

test("period report and customer ledger reject invalid dates and preserve date order", async () => {
  await expect(db.query("select * from report_period_summary('2026-10-11', '2026-10-10')")).rejects.toThrow("REPORT_PERIOD_INVALID");
  const buyer = (await db.query<{ id: string }>("select id from customers where name = 'Buyer'" )).rows[0];
  const rows = (await db.query<{ entry_kind: string; charge: string; payment: string; running_balance: string }>(
    `select entry_kind, charge, payment, running_balance from customer_period_ledger('${buyer.id}', '2026-10-10', '2026-10-10')`,
  )).rows;
  expect(rows).toEqual([{ entry_kind: "delivery", charge: "600.00", payment: "0", running_balance: "900.00" }, { entry_kind: "payment", charge: "0", payment: "300.00", running_balance: "600.00" }]);
  const summary = (await db.query<Record<string, string>>(
    `select * from customer_period_ledger_summary('${buyer.id}', '2026-10-10', '2026-10-10')`,
  )).rows[0];
  expect(summary).toMatchObject({ opening_balance: "300.00", litres: "4.00", charges: "600.00", payments: "300.00", closing_balance: "600.00" });
});

test("Khata summary carries an earlier balance into the selected period", async () => {
  const rows = (await db.query<Record<string, string>>(
    "select name, litres, charges, payments, opening_balance, closing_balance from khata_period_summary('2026-10-10', '2026-10-10')",
  )).rows;
  expect(rows).toContainEqual({ name: "Buyer", litres: "4.00", charges: "600.00", payments: "300.00", opening_balance: "300.00", closing_balance: "600.00" });
  const months = (await db.query<{ month_start: Date; closing_balance: string }>("select month_start, closing_balance from khata_year_month_summary(2026) order by month_start")).rows;
  expect(months.at(-1)).toMatchObject({ closing_balance: "1100.00" });
  expect(months.at(-1)?.month_start.toISOString().slice(0, 10)).toBe("2026-10-01");
});

test("Khata summary applies a customer opening balance on its actual opening date", async () => {
  const rows = (await db.query<Record<string, string>>(
    "select name, opening_balance, opening_added, closing_balance from khata_period_summary('2026-10-01', '2026-10-31')",
  )).rows;
  expect(rows).toContainEqual({ name: "Mid-period opening", opening_balance: "0", opening_added: "500.00", closing_balance: "500.00" });
});

test("daily milk balance carries closing litres forward and separates charity", async () => {
  await db.query("select save_milk_day_waste('2026-10-10', 1, 'Spill')");
  const rows = (await db.query<Record<string, string>>("select * from milk_report_daily('2026-10-10', '2026-10-11')")).rows;
  expect(rows[0]).toMatchObject({ produced_litres: "10.00", sold_litres: "4.00", charity_litres: "2.00", wasted_litres: "1.00", day_wasted_litres: "1.00", closing_litres: "3.00" });
  expect(rows[1]).toMatchObject({ opening_litres: "3.00", produced_litres: "0", closing_litres: "3.00" });
});

test("milk report waste corrections recalculate later opening stock and reject invalid writes", async () => {
  await db.query("select save_milk_day_waste('2026-10-10', 2, 'Bottle spill')");
  const rows = (await db.query<Record<string, string>>("select * from milk_report_daily('2026-10-10', '2026-10-11')")).rows;
  expect(rows[0].closing_litres).toBe("2.00");
  expect(rows[1]).toMatchObject({ opening_litres: "2.00", closing_litres: "2.00" });
  await expect(db.query("select save_milk_day_waste('2026-10-10', 4.01, 'Too much waste')")).rejects.toThrow("MILK_WASTE_EXCEEDS_AVAILABLE");
  await expect(db.query("select save_milk_day_waste('2026-10-10', 1, 'ab')")).rejects.toThrow("MILK_WASTE_REASON_REQUIRED");
  await expect(db.query("select save_milk_day_waste('2026-10-21', 0, null)")).rejects.toThrow("FUTURE_DATE");
  await db.exec("insert into month_locks(month, note) values ('2026-10-01', 'test lock')");
  await expect(db.query("select save_milk_day_waste('2026-10-11', 1, 'Spill')")).rejects.toThrow("MONTH_LOCKED");
});

test("animal milk report separates each animal, daily shifts, and zero-entry dates", async () => {
  const all = (await db.query<Record<string, string>>(
    "select report_date::text, tag, name, morning_litres, noon_litres, evening_litres, total_litres from milk_report_animals('2026-10-12', '2026-10-12', null)",
  )).rows;
  expect(all).toEqual([
    { report_date: "2026-10-12", tag: "MILK-1", name: "Pehli gaay", morning_litres: "2.50", noon_litres: "1.50", evening_litres: "2.00", total_litres: "6.00" },
    { report_date: "2026-10-12", tag: "MILK-2", name: "Doosri gaay", morning_litres: "1.00", noon_litres: "0", evening_litres: "0", total_litres: "1.00" },
  ]);
  const one = (await db.query<Record<string, string>>(
    "select report_date::text, tag, morning_litres, noon_litres, evening_litres, total_litres from milk_report_animals('2026-10-12', '2026-10-13', (select id from animals where tag='MILK-1'))",
  )).rows;
  expect(one).toEqual([
    { report_date: "2026-10-12", tag: "MILK-1", morning_litres: "2.50", noon_litres: "1.50", evening_litres: "2.00", total_litres: "6.00" },
    { report_date: "2026-10-13", tag: "MILK-1", morning_litres: "0", noon_litres: "0", evening_litres: "0", total_litres: "0" },
  ]);
  const bounds = (await db.query<Record<string, string>>("select * from milk_report_date_bounds()")).rows[0];
  expect(bounds).toMatchObject({ first_date: new Date("2026-10-09T00:00:00.000Z"), last_date: new Date("2026-10-12T00:00:00.000Z") });
  const customers = (await db.query<Record<string, string>>(
    "select name, charged, paid, outstanding from milk_report_customers('2026-10-10', '2026-10-10') order by name",
  )).rows;
  expect(customers).toContainEqual({ name: "Buyer", charged: "600.00", paid: "300.00", outstanding: "600.00" });
  expect(customers).toContainEqual({ name: "Mid-period opening", charged: "0", paid: "0", outstanding: "500.00" });
  const summary = (await db.query<Record<string, string>>(
    "select * from milk_report_summary('2026-10-10', '2026-10-11')",
  )).rows[0];
  expect(summary).toMatchObject({ opening_litres: "0.00", produced_litres: "10.00", available_litres: "10.00", sold_litres: "4.00", charity_litres: "2.00", wasted_litres: "2.00", closing_litres: "2.00", sales_amount: "600.00", received_amount: "300.00", outstanding_amount: "1100.00" });
  const animalTotals = (await db.query<Record<string, string>>(
    "select tag, morning_litres, noon_litres, evening_litres, total_litres, recorded_days, is_grand_total from milk_report_animals_summary('2026-10-12', '2026-10-12', null)",
  )).rows;
  expect(animalTotals).toContainEqual({ tag: "MILK-1", morning_litres: "2.50", noon_litres: "1.50", evening_litres: "2.00", total_litres: "6.00", recorded_days: 1, is_grand_total: false });
  expect(animalTotals.at(-1)).toMatchObject({ tag: "—", total_litres: "7.00", recorded_days: 1, is_grand_total: true });
});

test("milk report customer sales include company bills without attributing bill litres to delivery", async () => {
  const companyDb = await freshFarmDb({ farmDay: "2026-10-20" });
  try {
    const company = (await companyDb.query<{ id: string }>(
      "insert into customers(name, kind, opening_date) values ('Company buyer', 'company', '2026-10-01') returning id",
    )).rows[0];
    await companyDb.query("insert into company_bills(customer_id,from_date,to_date,litres,amount) values ($1,'2026-10-11','2026-10-11',5,750)", [company.id]);
    const row = (await companyDb.query<Record<string, string>>(
      "select name, litres, charged, paid, outstanding from milk_report_customers('2026-10-11','2026-10-11') where name='Company buyer'",
    )).rows[0];
    expect(row).toEqual({ name: "Company buyer", litres: "0", charged: "750.00", paid: "0", outstanding: "750.00" });
    const total = (await companyDb.query<Record<string, string>>(
      "select sales_amount, received_amount from milk_report_summary('2026-10-11','2026-10-11')",
    )).rows[0];
    expect(total).toEqual({ sales_amount: "750.00", received_amount: "0" });
  } finally { await companyDb.close(); }
});

test("milk distribution report reconciles all destinations, shift sales, dated receipts and Galla cash", async () => {
  const reportDb = await freshFarmDb({ farmDay: "2026-10-20" });
  try {
    const ids = (await reportDb.query<Record<string, string>>(`
      insert into customers(name,kind,free_reason,opening_date) values
        ('Khata buyer','regular',null,'2026-10-01'),
        ('Cash buyer','cash',null,'2026-10-01'),
        ('Company buyer','company',null,'2026-10-01')
      returning id,name
    `)).rows;
    const khata = ids.find((row) => row.name === "Khata buyer")!.id;
    const cash = ids.find((row) => row.name === "Cash buyer")!.id;
    const company = ids.find((row) => row.name === "Company buyer")!.id;
    await reportDb.query("insert into customer_rates(customer_id,rate,effective_from) values ($1,10,'2026-10-01'),($2,12,'2026-10-01')", [khata,cash]);
    await reportDb.exec("insert into milk_shifts(milk_date,shift,total_litres) values ('2026-10-10','morning',500),('2026-10-11','morning',160)");
    await reportDb.query("insert into milk_deliveries(delivery_date,shift,customer_id,litres) values ('2026-10-11','morning',$1,65),('2026-10-11','morning',$2,75)", [khata,cash]);
    await reportDb.exec(`
      insert into milk_dispositions(milk_date,shift_id,disposition_type,category,litres,recipient,note)
        select '2026-10-11'::date,s.id,'free','charity',10,'Charity House',null from milk_shifts s where s.milk_date='2026-10-11'
        union all
        select '2026-10-11'::date,s.id,'internal','owner_home',5,null,'Family use' from milk_shifts s where s.milk_date='2026-10-11'
        union all
        select '2026-10-11'::date,s.id,'wastage','spillage',5,null,'Spilled bucket' from milk_shifts s where s.milk_date='2026-10-11'
    `);
    await reportDb.query("insert into company_bills(customer_id,from_date,to_date,litres,amount) values ($1,'2026-10-11','2026-10-11',0,80)", [company]);
    await reportDb.query("insert into payments(customer_id,payment_date,amount,kind,method,account_id,note) select $1,'2026-10-12',150,'payment','cash',id,'Later Khata collection' from accounts where is_farm_cash", [khata]);

    const day = (await reportDb.query<Record<string, unknown>>(
      "select * from milk_report_distribution_daily('2026-10-11','2026-10-11')",
    )).rows[0];
    expect(day).toMatchObject({
      opening_litres: "500.00", produced_litres: "160.00", available_litres: "660.00",
      khata_litres: "65.00", cash_litres: "75.00", free_litres: "10.00", farm_use_litres: "5.00",
      wasted_litres: "5.00", allocated_litres: "160.00", remaining_litres: "500.00",
      khata_delivery_amount: "650.00", company_bill_amount: "80.00", khata_amount: "730.00",
      cash_sale_amount: "900.00", total_sales_amount: "1630.00",
      cash_received: "900.00", galla_cash_received: "900.00",
    });
    expect(day.free_details).toContainEqual(expect.objectContaining({ category: "charity", recipient: "Charity House", litres: 10 }));
    expect(day.farm_use_details).toContainEqual(expect.objectContaining({ category: "owner_home", note: "Family use" }));
    expect(day.waste_details).toContainEqual(expect.objectContaining({ category: "spillage", note: "Spilled bucket" }));

    const shift = (await reportDb.query<Record<string, string>>(
      "select * from milk_report_distribution_shifts('2026-10-11','2026-10-11')",
    )).rows[0];
    expect(shift).toMatchObject({
      report_date: new Date("2026-10-11T00:00:00.000Z"), milk_shift: "morning", produced_litres: "160.00",
      khata_litres: "65.00", cash_litres: "75.00", free_litres: "10.00", farm_use_litres: "5.00",
      wasted_litres: "5.00", allocated_litres: "160.00", remaining_litres: "0.00",
      khata_delivery_amount: "650.00", cash_sale_amount: "900.00", cash_received: "900.00", galla_cash_received: "900.00",
    });

    const period = (await reportDb.query<Record<string, string>>(
      "select * from milk_report_distribution_summary('2026-10-11','2026-10-12')",
    )).rows[0];
    expect(period).toMatchObject({
      opening_litres: "500.00", produced_litres: "160.00", available_litres: "660.00",
      khata_litres: "65.00", cash_litres: "75.00", free_litres: "10.00", farm_use_litres: "5.00",
      wasted_litres: "5.00", allocated_litres: "160.00", closing_litres: "500.00",
      khata_delivery_amount: "650.00", company_bill_amount: "80.00", khata_amount: "730.00",
      cash_sale_amount: "900.00", total_sales_amount: "1630.00",
      cash_received: "1050.00", galla_cash_received: "900.00", outstanding_khata_amount: "580.00",
    });

    await reportDb.query("update milk_deliveries set litres=60 where customer_id=$1 and delivery_date='2026-10-11'", [khata]);
    const corrected = (await reportDb.query<Record<string, string>>(
      "select khata_litres,allocated_litres,remaining_litres,khata_delivery_amount,company_bill_amount,khata_amount from milk_report_distribution_daily('2026-10-11','2026-10-11')",
    )).rows[0];
    expect(corrected).toEqual({ khata_litres: "60.00", allocated_litres: "155.00", remaining_litres: "505.00", khata_delivery_amount: "600.00", company_bill_amount: "80.00", khata_amount: "680.00" });
  } finally { await reportDb.close(); }
});

test("period functions stay owner-only in production and are explicitly available to the staging demo", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from report_period_summary('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_date_bounds()")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_summary('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_distribution_summary('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_distribution_daily('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_distribution_shifts('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_customers('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_animals('2026-10-10', '2026-10-10', null)")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from milk_report_animals_summary('2026-10-10', '2026-10-10', null)")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select save_milk_day_waste('2026-10-10', 0, null)")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from customer_period_ledger_summary('00000000-0000-0000-0000-000000000001', '2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await expect(db.query("select * from khata_period_summary('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await db.exec("reset role");
  const demo = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true });
  try {
    await demo.exec("set role anon");
    await expect(demo.query("select * from report_period_summary('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_date_bounds()")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_summary('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_distribution_summary('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_distribution_daily('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_distribution_shifts('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select * from milk_report_customers('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
    await expect(demo.query("select save_milk_day_waste('2026-10-10', 0, null)")).resolves.toBeDefined();
    await expect(demo.query("select * from customer_period_ledger_summary('00000000-0000-0000-0000-000000000001', '2026-10-10', '2026-10-10')")).rejects.toThrow("CUSTOMER_NOT_FOUND");
    await expect(demo.query("select * from khata_period_summary('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
  } finally {
    await demo.close();
  }
});
