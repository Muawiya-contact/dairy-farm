import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  await db.exec(`
    update accounts set opening_date = '2026-10-01';
    insert into animals(tag, arrival_date, milking_status) values ('MILK-1', '2026-10-01', 'milking');
    insert into customers(name, kind, free_reason, opening_date) values
      ('Buyer', 'regular', null, '2026-10-01'), ('House', 'free', 'owner', '2026-10-01');
    insert into customer_rates(customer_id, rate, effective_from)
      select id, 150, '2026-10-01' from customers where name = 'Buyer';
    insert into milk_shifts(milk_date, shift, total_litres) values ('2026-10-10', 'morning', 10);
    insert into milk_deliveries(delivery_date, shift, customer_id, litres)
      select '2026-10-10', 'morning', id, case name when 'Buyer' then 4 else 2 end from customers;
    insert into expenses(expense_date, category_id, account_id, amount)
      select '2026-10-10', c.id, a.id, 120.50 from expense_categories c cross join accounts a
      where c.name = 'Dawai / vet' and a.is_farm_cash;
    insert into expenses(expense_date, category_id, account_id, amount)
      select '2026-10-10', c.id, a.id, 40 from expense_categories c cross join accounts a
      where c.name = 'Ghar ka kharcha' and a.is_farm_cash;
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

test("milk month summary reconciles production, paid, free, and remainder litres", async () => {
  const row = (await db.query<{ produced: string; sold_litres: string; free_litres: string; delivered: string; difference: string }>(
    "select produced, sold_litres, free_litres, delivered, difference from milk_month_summary('2026-10-15')",
  )).rows[0];
  expect(row).toEqual({ produced: "10.00", sold_litres: "4.00", free_litres: "2.00", delivered: "6.00", difference: "4.00" });
});

test("expense month report keeps farm and home costs separate", async () => {
  const rows = (await db.query<{ category: string; is_farm_cost: boolean; amount: string }>(
    "select category, is_farm_cost, amount from expense_month_report('2026-10-15') order by category",
  )).rows;
  expect(rows).toEqual([
    { category: "Dawai / vet", is_farm_cost: true, amount: "120.50" },
    { category: "Ghar ka kharcha", is_farm_cost: false, amount: "40.00" },
  ]);
  expect((await db.query<{ farm_expenses: string; personal_expenses: string }>(
    "select farm_expenses, personal_expenses from pnl_month('2026-10-15')",
  )).rows[0]).toEqual({ farm_expenses: "120.50", personal_expenses: "40.00" });
});
