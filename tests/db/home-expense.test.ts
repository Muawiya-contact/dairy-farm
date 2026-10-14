import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
let accountId: string;
let homeCategoryId: string;

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
  homeCategoryId = (await db.query<{ id: string }>("select id from expense_categories where name = 'Ghar ka kharcha'")).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("Step 7 home expense rules", () => {
  it("provides one active personal category without changing farm classifications", async () => {
    expect((await db.query("select name, is_farm_cost, is_salary, active from expense_categories where id = $1", [homeCategoryId])).rows)
      .toEqual([{ name: "Ghar ka kharcha", is_farm_cost: false, is_salary: false, active: true }]);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expense_categories where lower(name) = 'ghar ka kharcha'")).rows[0].count).toBe(1);
    await expect(db.query("update expense_categories set is_farm_cost = true where id = $1", [homeCategoryId]))
      .rejects.toThrow(/home_category_personal/);
    await expect(db.query(
      "insert into expense_categories (name, is_farm_cost) values (' Ghar ka kharcha ', false)",
    )).rejects.toThrow(/expense_categories_home_name_uq/);
  });

  it("reduces only the chosen account and personal total, leaving farm profit intact", async () => {
    const before = (await db.query<{ balance: string }>("select account_balance_on($1, farm_today()) as balance", [accountId])).rows[0];
    const pnlBefore = (await db.query<{ farm_expenses: string; personal_expenses: string; profit: string }>(
      "select farm_expenses, personal_expenses, profit from pnl_month(farm_today())",
    )).rows[0];
    const expense = (await db.query<{ id: string }>(
      "insert into expenses (expense_date, category_id, account_id, amount, note) values (farm_today(), $1, $2, 125.50, 'Test home cost') returning id",
      [homeCategoryId, accountId],
    )).rows[0];
    const after = (await db.query<{ balance: string }>("select account_balance_on($1, farm_today()) as balance", [accountId])).rows[0];
    const pnlAfter = (await db.query<{ farm_expenses: string; personal_expenses: string; profit: string }>(
      "select farm_expenses, personal_expenses, profit from pnl_month(farm_today())",
    )).rows[0];
    expect(Number(after.balance)).toBe(Number(before.balance) - 125.5);
    expect(Number(pnlAfter.personal_expenses)).toBe(Number(pnlBefore.personal_expenses) + 125.5);
    expect(pnlAfter.farm_expenses).toBe(pnlBefore.farm_expenses);
    expect(pnlAfter.profit).toBe(pnlBefore.profit);
    expect((await db.query("select entry_kind, money_out, description from account_entries($1) where ref_id = $2", [accountId, expense.id])).rows)
      .toEqual([{ entry_kind: "expense", money_out: "125.50", description: "Kharcha: Ghar ka kharcha (Test home cost)" }]);
  });

  it("rejects future dates, inactive accounts and categories, and dates before account opening", async () => {
    await expect(db.query(
      "insert into expenses (expense_date, category_id, account_id, amount) values (farm_today() + 1, $1, $2, 1)",
      [homeCategoryId, accountId],
    )).rejects.toThrow(/FUTURE_DATE/);
    const inactive = (await db.query<{ id: string }>("insert into accounts (name, kind, active) values ('Closed home test', 'cash', false) returning id")).rows[0].id;
    await expect(db.query(
      "insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1)",
      [homeCategoryId, inactive],
    )).rejects.toThrow(/ACCOUNT_INACTIVE/);
    const openedToday = (await db.query<{ id: string }>("insert into accounts (name, kind) values ('New home test', 'bank') returning id")).rows[0].id;
    await expect(db.query(
      "insert into expenses (expense_date, category_id, account_id, amount) values (farm_today() - 1, $1, $2, 1)",
      [homeCategoryId, openedToday],
    )).rejects.toThrow(/EXPENSE_BEFORE_ACCOUNT/);
    const inactiveCategory = (await db.query<{ id: string }>("insert into expense_categories (name, is_farm_cost, active) values ('Old home test', false, false) returning id")).rows[0].id;
    await expect(db.query(
      "insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1)",
      [inactiveCategory, accountId],
    )).rejects.toThrow(/CATEGORY_INACTIVE/);
    await expect(db.query(
      "insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, -1)",
      [homeCategoryId, accountId],
    )).rejects.toThrow(/expenses_amount_check/);
  });

  it("enforces owner access and closed months for the existing expenses table", async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const stranger = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id) values ($1),($2)", [owner, stranger]);
    await db.query("insert into private.app_owner(user_id) values ($1)", [owner]);
    await db.exec("update private.demo_access set enabled = false where id = 1");
    await db.exec("set role anon");
    try {
      await expect(db.query("insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1)",
        [homeCategoryId, accountId])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${stranger}'; set role authenticated`);
    try {
      await expect(db.query("insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1)",
        [homeCategoryId, accountId])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${owner}'; set role authenticated`);
    try {
      expect((await db.query("insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1) returning id",
        [homeCategoryId, accountId])).rows).toHaveLength(1);
    } finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
    await db.exec("insert into month_locks (month) values (date_trunc('month', farm_today())::date)");
    await expect(db.query("insert into expenses (expense_date, category_id, account_id, amount) values (farm_today(), $1, $2, 1)",
      [homeCategoryId, accountId])).rejects.toThrow(/MONTH_LOCKED/);
  });
});
