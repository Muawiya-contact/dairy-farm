import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => { db = await freshFarmDb({ farmDay: "2026-10-20", demo: true }); }, 30_000);
afterAll(async () => { await db?.close(); });

test("a full October demo month reconciles milk, sales, khata, cash and profit", async () => {
  // 14 × (80 morning + 70 evening) + 3 × 25 noon = 2,175 L production.
  // 14 × 12 L free plus 3 × 1 L noon free = 171 L; sold = 2,004 L.
  // Paid deliveries: 14 × 70 L × Rs 150 plus 3 × 7 L noon × Rs 150 = Rs 150,150.
  // Add the Rs 62,832 company slip: Rs 212,982 milk income.
  // Ahmed: Rs 12,000 opening + (14 × 10 + 3 × 2) L × Rs 150 - Rs 10,000 = Rs 23,900.
  // Farm cash: Rs 5,000 opening + Rs 10,000 Ahmed + 14 × Rs 750 Naqd
  //            - Rs 3,000 expense - Rs 15,000 transfer = Rs 7,500.
  // Farm cost: Rs 21,000 Wanda + 12,000 Bijli + 3,000 small + 25,000 salary = 61,000.
  // Profit: Rs 212,982 - 61,000 = Rs 151,982.
  const milk = (await db.query<{ produced: string; sold_litres: string; free_litres: string; delivered: string; difference: string }>(
    "select produced, sold_litres, free_litres, delivered, difference from milk_month_summary('2026-10-01')",
  )).rows[0];
  expect(milk).toEqual({ produced: "2175.00", sold_litres: "2004.00", free_litres: "171.00", delivered: "2175.00", difference: "0.00" });
  const ahmed = (await db.query<{ litres: string; amount: string; previous_balance: string; paid: string; balance: string }>(
    "select litres, amount, previous_balance, paid, balance from customer_month_report('2026-10-01') where name = 'Ahmed'",
  )).rows[0];
  expect(ahmed).toEqual({ litres: "146.00", amount: "21900.00", previous_balance: "12000.00", paid: "10000.00", balance: "23900.00" });
  const cash = (await db.query<{ balance: string }>(
    "select account_balance_on(id, '2026-10-20') as balance from accounts where is_farm_cash",
  )).rows[0];
  expect(cash.balance).toBe("7500.00");
  const pnl = (await db.query<{ milk_income: string; farm_expenses: string; personal_expenses: string; profit: string }>(
    "select milk_income, farm_expenses, personal_expenses, profit from pnl_month('2026-10-01')",
  )).rows[0];
  expect(pnl).toEqual({ milk_income: "212982.00", farm_expenses: "61000.00", personal_expenses: "0", profit: "151982.00" });
});
