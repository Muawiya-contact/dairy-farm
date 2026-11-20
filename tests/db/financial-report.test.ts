import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshFarmDb } from "./db-fixture";
import type { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let farmCash: string;
let bank: string;
let workerId: string;
let salaryPeriodId: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20", demo: true });
  farmCash = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  bank = (await db.query<{ id: string }>(
    "insert into accounts(name,kind,opening_date,opening_balance) values ('Report bank','bank','2026-11-01',1000) returning id",
  )).rows[0].id;
  workerId = (await db.query<{ id: string }>(
    "insert into staff(name,role) values ('Pending report worker','Worker') returning id",
  )).rows[0].id;
  salaryPeriodId = (await db.query<{ id: string }>(
    "insert into salary_periods(staff_id,salary_month,agreed_amount) values ($1,'2026-11-01',1000) returning id", [workerId],
  )).rows[0].id;
  const salaryCategory = (await db.query<{ id: string }>("select id from expense_categories where is_salary limit 1")).rows[0].id;
  const animalId = (await db.query<{ id: string }>("select id from animals where tag='101'")).rows[0].id;
  await db.query(
    `insert into expenses(expense_date,category_id,account_id,amount,staff_id,salary_period_id,note)
      values ('2026-11-18',$1,$2,250,$3,$4,'Partial salary payment')`,
    [salaryCategory, farmCash, workerId, salaryPeriodId],
  );
  await db.query(
    "insert into transfers(transfer_date,from_account_id,to_account_id,amount,note) values ('2026-11-18',$1,$2,250,'Report transfer')",
    [farmCash, bank],
  );
  await db.query(
    "insert into other_income(income_date,kind,amount,account_id,note) values ('2026-11-20','manure',60,$1,'Report manure')", [bank],
  );
  await db.query("select close_animal($1,'sold','2026-11-20','Report animal sale',200,$2)", [animalId, farmCash]);
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("financial report read models", () => {
  it("reconciles each account and separates transfers from operating cash movement", async () => {
    const rows = (await db.query<{
      account_id: string; opening_balance: string; money_received: string; money_paid: string;
      transfers_in: string; transfers_out: string; closing_balance: string;
    }>("select * from financial_report_cashflow('2026-11-01','2026-11-20')")).rows;
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(Number(row.opening_balance) + Number(row.money_received) - Number(row.money_paid)
        + Number(row.transfers_in) - Number(row.transfers_out)).toBeCloseTo(Number(row.closing_balance), 2);
      const actual = (await db.query<{ balance: string }>(
        "select account_balance_on($1,'2026-11-20') as balance", [row.account_id],
      )).rows[0];
      expect(Number(row.closing_balance)).toBe(Number(actual.balance));
    }
    expect(rows.reduce((sum, row) => sum + Number(row.transfers_in), 0))
      .toBe(rows.reduce((sum, row) => sum + Number(row.transfers_out), 0));
    const openingAccount = rows.find((row) => row.account_id === bank)!;
    expect(Number(openingAccount.opening_balance)).toBe(0);
    expect(Number(openingAccount.money_received)).toBe(1060);
    expect(Number(openingAccount.transfers_in)).toBe(250);

    await expect(db.query("select * from financial_report_cashflow('2026-11-21','2026-11-20')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
    await expect(db.query("select * from financial_report_cashflow('2026-11-20','2026-11-21')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
  });

  it("matches selected-period trends to the authoritative P&L and ledgers", async () => {
    const summary = (await db.query<{
      milk_income: string; cash_collected: string; other_income: string;
      farm_expenses: string; home_expenses: string; profit: string;
    }>("select * from report_period_summary('2026-11-01','2026-11-20')")).rows[0];
    const trends = (await db.query<{
      milk_income: string; other_income: string; customer_collections: string;
      farm_expenses: string; home_expenses: string; total_income: string;
      net_profit: string; cash_received: string; cash_paid: string;
    }>("select * from financial_report_trends('2026-11-01','2026-11-20')")).rows;
    const sum = (key: keyof typeof trends[number]) => trends.reduce((total, row) => total + Number(row[key]), 0);
    expect(sum("milk_income")).toBe(Number(summary.milk_income));
    expect(sum("other_income")).toBe(Number(summary.other_income));
    expect(sum("customer_collections")).toBe(Number(summary.cash_collected));
    expect(sum("farm_expenses")).toBe(Number(summary.farm_expenses));
    expect(sum("home_expenses")).toBe(Number(summary.home_expenses));
    expect(sum("net_profit")).toBe(Number(summary.profit));
    expect(sum("total_income")).toBe(Number(summary.milk_income) + Number(summary.other_income));

    const periodOnly = (await db.query<{ milk_income: string; total_income: string; net_profit: string }>(
      "select * from financial_report_trends('2026-11-20','2026-11-20')",
    )).rows;
    expect(periodOnly).toHaveLength(1);
    expect(Number(periodOnly[0].total_income)).toBe(260);

    const incomes = (await db.query<{ kind: string; amount: string; animal_tag: string | null }>(
      "select kind,amount,animal_tag from financial_report_income_rows('2026-11-20','2026-11-20',100,0) order by kind",
    )).rows;
    expect(incomes).toContainEqual({ kind: "animal_sale", amount: "200.00", animal_tag: "101" });
    expect(incomes).toContainEqual({ kind: "manure", amount: "60.00", animal_tag: null });
    await expect(db.query("select * from financial_report_income_rows('2026-11-20','2026-11-20',0,0)"))
      .rejects.toThrow(/FINANCIAL_REPORT_PAGE_INVALID/);
  });

  it("reports salary balances as of the selected day without adding a second P&L expense", async () => {
    const beforePay = (await db.query<{ paid_amount: string; outstanding_amount: string }>(
      "select paid_amount,outstanding_amount from financial_report_salary_payables('2026-11-17') where staff_id=$1", [workerId],
    )).rows[0];
    expect([Number(beforePay.paid_amount), Number(beforePay.outstanding_amount)]).toEqual([0, 1000]);
    const afterPay = (await db.query<{ paid_amount: string; outstanding_amount: string }>(
      "select paid_amount,outstanding_amount from financial_report_salary_payables('2026-11-18') where staff_id=$1", [workerId],
    )).rows[0];
    expect([Number(afterPay.paid_amount), Number(afterPay.outstanding_amount)]).toEqual([250, 750]);
    const summary = (await db.query<{ farm_expenses: string; profit: string; other_income: string; milk_income: string }>(
      "select * from report_period_summary('2026-11-18','2026-11-20')",
    )).rows[0];
    expect(Number(summary.profit)).toBe(Number(summary.milk_income) + Number(summary.other_income) - Number(summary.farm_expenses));
    expect(Number(summary.farm_expenses)).toBeGreaterThanOrEqual(250);
    expect(salaryPeriodId).toBeTruthy();
    await expect(db.query("select * from financial_report_salary_payables('2026-11-21')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);
  });

  it("keeps the new reports private outside the staging demo role", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from financial_report_cashflow('2026-11-20','2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
      await expect(db.query("select * from financial_report_salary_payables('2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
    } finally { await db.exec("reset role"); }

    const demo = await freshFarmDb({ farmDay: "2026-11-20", demo: true, demoAccess: true });
    try {
      await demo.exec("set role anon");
      expect((await demo.query("select * from financial_report_trends('2026-11-20','2026-11-20')")).rows).toHaveLength(1);
      expect((await demo.query("select * from financial_report_cashflow('2026-11-20','2026-11-20')")).rows.length).toBeGreaterThan(0);
    } finally { await demo.close(); }
  });
});
