import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let farmCash: string;
let buyerId: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20" });
  await db.exec("update accounts set opening_date='2026-10-01'");
  farmCash = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  buyerId = (await db.query<{ id: string }>(
    `insert into customers(name,kind,opening_date,opening_balance)
      values ('Final report buyer','company','2026-10-01',80) returning id`,
  )).rows[0].id;
  const advanceId = (await db.query<{ id: string }>(
    `insert into customers(name,kind,opening_date,opening_balance)
      values ('Final report advance','regular','2026-10-01',-25) returning id`,
  )).rows[0].id;
  await db.query(
    `insert into company_bills(customer_id,from_date,to_date,litres,amount)
      values ($1,'2026-11-10','2026-11-10',10,100)`, [buyerId],
  );
  await db.query(
    `insert into payments(customer_id,payment_date,amount,kind,method,account_id) values
      ($1,'2026-11-12',30,'payment','cash',$3),
      ($1,'2026-11-13',10,'discount',null,null),
      ($1,'2026-11-14',5,'refund','cash',$3),
      ($2,'2026-11-14',5,'payment','cash',$3)`, [buyerId, advanceId, farmCash],
  );
  await db.query("insert into accounts(name,kind,opening_date,opening_balance) values ('Final report bank','bank','2026-10-01',120)");
  await db.query("insert into accounts(name,kind,opening_date,opening_balance) values ('Owner pocket','person','2026-10-01',800)");
  await db.query(
    `insert into expenses(expense_date,category_id,account_id,amount,note)
      select '2026-11-17',c.id,$1,20.50,'Final report farm cost' from expense_categories c where c.name='Dawai / vet'`, [farmCash],
  );
  await db.query(
    `insert into expenses(expense_date,category_id,account_id,amount,note)
      select '2026-11-17',c.id,$1,4.50,'Final report home cost' from expense_categories c where c.name='Dukan bill'`, [farmCash],
  );
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("Final Report database summaries", () => {
  it("keeps payable, payments, closing receivables, and customer advances distinct", async () => {
    const rows = (await db.query<{
      is_grand_total: boolean; customer_id: string | null; name: string; total_payable: string;
      opening_balance: string; charges: string; payments: string; discounts: string; refunds: string;
      closing_balance: string; receivables_due: string; customer_credits: string;
    }>("select * from final_report_khata('2026-11-01','2026-11-20')")).rows;
    const buyer = rows.find((row) => row.customer_id === buyerId)!;
    const totals = rows.find((row) => row.is_grand_total)!;
    expect(Object.fromEntries(Object.entries(buyer).map(([key, value]) => [key, [
      "opening_balance", "charges", "total_payable", "payments", "discounts", "refunds",
      "closing_balance", "receivables_due", "customer_credits",
    ].includes(key) ? Number(value) : value]))).toMatchObject({
      opening_balance: 80, charges: 100, total_payable: 175, payments: 30,
      discounts: 10, refunds: 5, closing_balance: 145, receivables_due: 145, customer_credits: 0,
    });
    expect(Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, [
      "total_payable", "payments", "closing_balance", "receivables_due", "customer_credits",
    ].includes(key) ? Number(value) : value]))).toMatchObject({
      total_payable: 150, payments: 35, closing_balance: 115, receivables_due: 145, customer_credits: 30,
    });
    const nextPeriod = (await db.query<{ opening_balance: string; opening_added: string; closing_balance: string }>(
      `select opening_balance,opening_added,closing_balance from final_report_khata('2026-11-15','2026-11-20') where customer_id=$1`, [buyerId],
    )).rows[0];
    expect(nextPeriod).toMatchObject({ opening_balance: "145.00", opening_added: "0", closing_balance: "145.00" });
    await expect(db.query("select * from final_report_khata('2026-11-21','2026-11-20')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
  });

  it("sums only cash and bank account closing balances in PostgreSQL", async () => {
    const position = (await db.query<{ closing_cash_bank_balance: string; cash_bank_account_count: number }>(
      "select * from final_report_cash_position('2026-11-01','2026-11-20')",
    )).rows[0];
    const source = (await db.query<{ balance: string; count: string }>(
      `select sum(closing_balance) as balance, count(*) as count
        from financial_report_cashflow('2026-11-01','2026-11-20') where account_kind in ('cash','bank')`,
    )).rows[0];
    expect(position.closing_cash_bank_balance).toBe(source.balance);
    expect(position.cash_bank_account_count).toBe(Number(source.count));
    expect(position.closing_cash_bank_balance).toBe("125.00");
    await expect(db.query("select * from final_report_cash_position('2026-11-20','2026-11-21')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
  });

  it("groups expense amounts once by database category and matches the P&L", async () => {
    const categories = (await db.query<{ category: string; is_farm_cost: boolean; entries: number; amount: string }>(
      "select * from final_report_expense_categories('2026-11-01','2026-11-20')",
    )).rows;
    expect(categories).toContainEqual({ category: "Dawai / vet", is_farm_cost: true, entries: 1, amount: "20.50" });
    expect(categories).toContainEqual({ category: "Dukan bill", is_farm_cost: false, entries: 1, amount: "4.50" });
    const summary = (await db.query<{ farm_expenses: string; home_expenses: string }>(
      "select farm_expenses,home_expenses from report_period_summary('2026-11-01','2026-11-20')",
    )).rows[0];
    const farmTotal = categories.filter((row) => row.is_farm_cost).reduce((sum, row) => sum + Number(row.amount), 0);
    const homeTotal = categories.filter((row) => !row.is_farm_cost).reduce((sum, row) => sum + Number(row.amount), 0);
    expect(farmTotal).toBe(Number(summary.farm_expenses));
    expect(homeTotal).toBe(Number(summary.home_expenses));
    await expect(db.query("select * from final_report_expense_categories('2026-11-01','2026-11-21')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
  });

  it("returns a zero grand-total row for an empty period and protects both report functions", async () => {
    const empty = await freshFarmDb({ farmDay: "2026-11-20" });
    try {
      const rows = (await empty.query<{ is_grand_total: boolean; customer_id: string | null; litres: string; total_payable: string }>(
        "select * from final_report_khata('2026-11-01','2026-11-20')",
      )).rows;
      expect(rows).toEqual([{ is_grand_total: true, customer_id: null, name: "Grand total", sort_order: 2147483647,
        litres: "0", opening_balance: "0", opening_added: "0", charges: "0", balance_adjustments: "0", total_payable: "0",
        payments: "0", discounts: "0", refunds: "0", closing_balance: "0", receivables_due: "0", customer_credits: "0" }]);
    } finally { await empty.close(); }

    await db.exec("set role anon");
    try {
      await expect(db.query("select * from final_report_khata('2026-11-01','2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
      await expect(db.query("select * from final_report_cash_position('2026-11-01','2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
      await expect(db.query("select * from final_report_expense_categories('2026-11-01','2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
    } finally { await db.exec("reset role"); }

    const demo = await freshFarmDb({ farmDay: "2026-11-20", demo: true, demoAccess: true });
    try {
      await demo.exec("set role anon");
      const demoKhata = (await demo.query<{ is_grand_total: boolean }>("select * from final_report_khata('2026-11-01','2026-11-20')")).rows;
      expect(demoKhata.some((row) => row.is_grand_total)).toBe(true);
      expect((await demo.query("select * from final_report_cash_position('2026-11-01','2026-11-20')")).rows).toHaveLength(1);
      expect((await demo.query("select * from final_report_expense_categories('2026-11-01','2026-11-20')")).rows).toBeDefined();
    } finally { await demo.close(); }
  }, 60_000);
});
