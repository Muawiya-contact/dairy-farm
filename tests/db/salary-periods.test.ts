import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
let staffId: string;
let periodId: string;
let accountId: string;
let salaryCategoryId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const dir = resolve("supabase/migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(resolve(dir, file), "utf8"));
  }
  await db.exec(readFileSync(resolve("supabase/seed/dev-demo.sql"), "utf8"));
  accountId = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  staffId = (await db.query<{ id: string }>("insert into staff(name, monthly_salary) values ('Salary test worker', 1000) returning id")).rows[0].id;
  salaryCategoryId = (await db.query<{ id: string }>("select id from expense_categories where name = 'Tankhwah'")).rows[0].id;
  periodId = (await db.query<{ id: string }>(
    "insert into salary_periods(staff_id, salary_month, agreed_amount) values ($1, date_trunc('month', farm_today())::date, 1000) returning id",
    [staffId],
  )).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("salary periods and payments", () => {
  it("backfills old salary expenses without inventing an unpaid balance", async () => {
    const rows = (await db.query<{ agreed_amount: string; paid: string }>(`
      select p.agreed_amount, sum(e.amount) as paid
      from salary_periods p join expenses e on e.salary_period_id = p.id
      join staff s on s.id = p.staff_id where s.name = 'Ismail'
      group by p.id
    `)).rows;
    expect(rows).toEqual([{ agreed_amount: "25000.00", paid: "25000.00" }]);
    await db.query("update staff set monthly_salary = 1200 where id = $1", [staffId]);
    expect((await db.query("select agreed_amount from salary_periods where id = $1", [periodId])).rows)
      .toEqual([{ agreed_amount: "1000.00" }]);
    await expect(db.query("insert into salary_periods(staff_id, salary_month, agreed_amount) values ($1, date_trunc('month', farm_today())::date, 1200)", [staffId]))
      .rejects.toThrow(/salary_periods_staff_id_salary_month_key/);
  });

  it("records two partial payments once in Galla and farm profit", async () => {
    const before = (await db.query<{ balance: string }>("select account_balance_on($1, farm_today()) as balance", [accountId])).rows[0];
    const pnlBefore = (await db.query<{ farm_expenses: string; profit: string }>("select farm_expenses, profit from pnl_month(farm_today())")).rows[0];
    const first = (await db.query<{ id: string }>(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values (farm_today(), $1, $2, $3, $4, 400) returning id
    `, [salaryCategoryId, accountId, staffId, periodId])).rows[0].id;
    await db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values (farm_today(), $1, $2, $3, $4, 600)
    `, [salaryCategoryId, accountId, staffId, periodId]);
    const after = (await db.query<{ balance: string }>("select account_balance_on($1, farm_today()) as balance", [accountId])).rows[0];
    const pnlAfter = (await db.query<{ farm_expenses: string; profit: string }>("select farm_expenses, profit from pnl_month(farm_today())")).rows[0];
    expect(Number(after.balance) - Number(before.balance)).toBe(-1000);
    expect(Number(pnlAfter.farm_expenses) - Number(pnlBefore.farm_expenses)).toBe(1000);
    expect(Number(pnlAfter.profit) - Number(pnlBefore.profit)).toBe(-1000);
    expect((await db.query("select entry_kind, money_out from account_entries($1) where ref_id = $2", [accountId, first])).rows)
      .toEqual([{ entry_kind: "expense", money_out: "400.00" }]);
    await expect(db.query("update expenses set amount = 1 where id = $1", [first]))
      .rejects.toThrow(/SALARY_PAYMENT_IMMUTABLE/);
    await expect(db.query("delete from expenses where id = $1", [first]))
      .rejects.toThrow(/SALARY_PAYMENT_IMMUTABLE/);
    await expect(db.query("update expense_categories set is_salary = false where id = $1", [salaryCategoryId]))
      .rejects.toThrow(/SALARY_CATEGORY_FIXED/);
    const ordinary = (await db.query<{ id: string }>(
      "select id from expenses where salary_period_id is null limit 1",
    )).rows[0].id;
    await expect(db.query("update expenses set note = 'ordinary correction' where id = $1", [ordinary]))
      .rejects.toThrow(/EXPENSE_USE_CORRECTION/);
    await expect(db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values (farm_today(), $1, $2, $3, $4, 0.01)
    `, [salaryCategoryId, accountId, staffId, periodId])).rejects.toThrow(/SALARY_OVERPAID/);
    await expect(db.query("update salary_periods set agreed_amount = 999 where id = $1", [periodId]))
      .rejects.toThrow(/SALARY_BELOW_PAID/);
    await expect(db.query("update salary_periods set agreed_amount = 1100 where id = $1", [periodId]))
      .rejects.toThrow(/SALARY_PERIOD_PAID/);
  });

  it("rejects missing or mismatched salary links and advances", async () => {
    await expect(db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, amount)
      values (farm_today(), $1, $2, $3, 1)
    `, [salaryCategoryId, accountId, staffId])).rejects.toThrow(/SALARY_LINK_REQUIRED/);
    await expect(db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values (farm_today(), $1, $2, (select id from staff where name = 'Ismail'), $3, 1)
    `, [salaryCategoryId, accountId, periodId])).rejects.toThrow(/SALARY_STAFF_MISMATCH/);
    await expect(db.query("insert into salary_periods(staff_id, salary_month, agreed_amount) values ($1, (date_trunc('month', farm_today()) + interval '1 month')::date, 100)", [staffId]))
      .rejects.toThrow(/SALARY_FUTURE_MONTH/);
    const lastMonth = (await db.query<{ id: string }>("insert into salary_periods(staff_id, salary_month, agreed_amount) values ($1, (date_trunc('month', farm_today()) - interval '1 month')::date, 100) returning id", [staffId])).rows[0].id;
    const oldAccount = (await db.query<{ id: string }>("insert into accounts(name, kind, opening_date) values ('Old salary account', 'cash', farm_today() - 90) returning id")).rows[0].id;
    await expect(db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values ((date_trunc('month', farm_today()) - interval '1 month 1 day')::date, $1, $2, $3, $4, 1)
    `, [salaryCategoryId, oldAccount, staffId, lastMonth])).rejects.toThrow(/SALARY_ADVANCE_NOT_ENABLED/);
  });

  it("protects periods with month locks and owner-only production access", async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const stranger = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id) values ($1),($2)", [owner, stranger]);
    await db.query("insert into private.app_owner(user_id) values ($1)", [owner]);
    await db.exec("update private.demo_access set enabled = false where id = 1");
    await db.exec("set role anon");
    try { await expect(db.query("select id from salary_periods")).rejects.toThrow(); }
    finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${stranger}'; set role authenticated`);
    try { expect((await db.query("select id from salary_periods")).rows).toEqual([]); }
    finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${owner}'; set role authenticated`);
    try { expect((await db.query("select id from salary_periods")).rows.length).toBeGreaterThan(0); }
    finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
    const unpaidStaff = (await db.query<{ id: string }>("insert into staff(name, monthly_salary) values ('Unpaid lock worker', 100) returning id")).rows[0].id;
    const unpaidPeriod = (await db.query<{ id: string }>("insert into salary_periods(staff_id, salary_month, agreed_amount) values ($1, date_trunc('month', farm_today())::date, 100) returning id", [unpaidStaff])).rows[0].id;
    await db.exec("insert into month_locks(month) values (date_trunc('month', farm_today())::date)");
    await expect(db.query("update salary_periods set agreed_amount = 101 where id = $1", [unpaidPeriod]))
      .rejects.toThrow(/MONTH_LOCKED/);
    await expect(db.query(`
      insert into expenses(expense_date, category_id, account_id, staff_id, salary_period_id, amount)
      values (farm_today(), $1, $2, $3, $4, 1)
    `, [salaryCategoryId, accountId, unpaidStaff, unpaidPeriod])).rejects.toThrow(/MONTH_LOCKED/);
  });
});
