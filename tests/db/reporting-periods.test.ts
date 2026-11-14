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
    insert into customer_rates(customer_id, rate, effective_from)
      select id, 150, '2026-10-01' from customers where name = 'Buyer';
    insert into milk_shifts(milk_date, shift, total_litres) values ('2026-10-10', 'morning', 10);
    insert into milk_deliveries(delivery_date, shift, customer_id, litres)
      select '2026-10-10', 'morning', id, case name when 'Buyer' then 4 else 2 end from customers;
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
});

test("period report and customer ledger reject invalid dates and preserve date order", async () => {
  await expect(db.query("select * from report_period_summary('2026-10-11', '2026-10-10')")).rejects.toThrow("REPORT_PERIOD_INVALID");
  const buyer = (await db.query<{ id: string }>("select id from customers where name = 'Buyer'" )).rows[0];
  const rows = (await db.query<{ entry_kind: string; charge: string; credit: string }>(
    `select entry_kind, charge, credit from customer_period_ledger('${buyer.id}', '2026-10-10', '2026-10-10')`,
  )).rows;
  expect(rows).toEqual([{ entry_kind: "delivery", charge: "600.00", credit: "0" }, { entry_kind: "payment", charge: "0", credit: "300.00" }]);
});

test("period functions stay owner-only in production and are explicitly available to the staging demo", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from report_period_summary('2026-10-10', '2026-10-10')")).rejects.toThrow(/permission|denied/i);
  await db.exec("reset role");
  const demo = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true });
  try {
    await demo.exec("set role anon");
    await expect(demo.query("select * from report_period_summary('2026-10-10', '2026-10-10')")).resolves.toBeDefined();
  } finally {
    await demo.close();
  }
});
