import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
let farmCash: string;
let bank: string;
let ahmed: string;

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
  farmCash = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  bank = (await db.query<{ id: string }>("insert into accounts (name, kind) values ('Test bank', 'bank') returning id")).rows[0].id;
  ahmed = (await db.query<{ id: string }>("select id from customers where name = 'Ahmed'")).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("Step 6 database money rules", () => {
  it("shows a closed account while it still holds a balance", async () => {
    const closed = (await db.query<{ id: string }>(
      "insert into accounts (name, kind, opening_balance, opening_date, active) values ('Closed test account', 'bank', 40, farm_today(), false) returning id",
    )).rows[0].id;
    const summary = (await db.query<{ opening: string; closing: string }>(
      "select opening, closing from account_month_summary(farm_today()) where account_id = $1", [closed],
    )).rows[0];
    expect(Number(summary.opening)).toBe(40);
    expect(Number(summary.closing)).toBe(40);
  });

  it("moves money once between accounts and rejects invalid transfers", async () => {
    const before = (await db.query<{ account_id: string; closing: string }>("select account_id, closing from account_month_summary(farm_today()) where account_id in ($1, $2)", [farmCash, bank])).rows;
    const date = (await db.query<{ day: string }>("select farm_today() as day")).rows[0].day;
    const id = (await db.query<{ id: string }>(
      "insert into transfers (transfer_date, from_account_id, to_account_id, amount, note) values ($1, $2, $3, 125.50, 'Test transfer') returning id",
      [date, farmCash, bank],
    )).rows[0].id;
    const after = (await db.query<{ account_id: string; closing: string }>("select account_id, closing from account_month_summary(farm_today()) where account_id in ($1, $2)", [farmCash, bank])).rows;
    const balance = (rows: typeof after, account: string) => Number(rows.find((row) => row.account_id === account)?.closing);
    expect(balance(after, farmCash) - balance(before, farmCash)).toBe(-125.5);
    expect(balance(after, bank) - balance(before, bank)).toBe(125.5);
    expect((await db.query("select entry_kind from account_entries($1) where ref_id = $2", [farmCash, id])).rows).toEqual([{ entry_kind: "transfer_out" }]);
    await expect(db.query("insert into transfers (transfer_date, from_account_id, to_account_id, amount) values ($1,$2,$2,1)", [date, farmCash])).rejects.toThrow();
    await expect(db.query("insert into transfers (transfer_date, from_account_id, to_account_id, amount) values ($1,$2,$3,-1)", [date, farmCash, bank])).rejects.toThrow();
    await expect(db.query("insert into transfers (transfer_date, from_account_id, to_account_id, amount) values (farm_today()+1,$1,$2,1)", [farmCash, bank])).rejects.toThrow(/FUTURE_DATE/);
    await db.query("update accounts set active = false where id = $1", [bank]);
    await expect(db.query("insert into transfers (transfer_date, from_account_id, to_account_id, amount) values ($1,$2,$3,1)", [date, farmCash, bank])).rejects.toThrow(/ACCOUNT_INACTIVE/);
    await db.query("update accounts set active = true where id = $1", [bank]);
  });

  it("stores a cash-count snapshot and requires a reason for a discrepancy", async () => {
    const date = (await db.query<{ day: string }>("select farm_today() as day")).rows[0].day;
    const expected = Number((await db.query<{ balance: string }>("select account_balance_on($1, $2) as balance", [farmCash, date])).rows[0].balance);
    const count = (await db.query<{ id: string; expected_balance: string; difference: string }>(
      "insert into cash_counts (account_id, count_date, counted_amount) values ($1,$2,$3) returning id, expected_balance, difference",
      [farmCash, date, expected],
    )).rows[0];
    expect(Number(count.expected_balance)).toBe(expected);
    expect(Number(count.difference)).toBe(0);
    await expect(db.query("insert into cash_counts (account_id, count_date, counted_amount) values ($1,$2,$3)", [farmCash, date, expected + 5])).rejects.toThrow(/COUNT_REASON_REQUIRED/);
    const changed = (await db.query<{ difference: string }>(
      "insert into cash_counts (account_id, count_date, counted_amount, reason) values ($1,$2,$3,'Cash dobara gina') returning difference",
      [farmCash, date, expected + 5],
    )).rows[0];
    expect(Number(changed.difference)).toBe(5);
    await expect(db.query("insert into cash_counts (account_id, count_date, counted_amount) values ($1,$2,0)", [bank, date])).rejects.toThrow(/CASH_ACCOUNT_REQUIRED/);
    await expect(db.query("update cash_counts set counted_amount = 1 where id = $1", [count.id])).rejects.toThrow(/CASH_COUNT_IMMUTABLE/);
  });

  it("audits corrections and voids while protecting Naqd auto payments", async () => {
    const payment = (await db.query<{ id: string; revision: number }>(
      "insert into payments (customer_id,payment_date,amount,kind,method,account_id) values ($1,farm_today(),100,'payment','cash',$2) returning id,revision",
      [ahmed, farmCash],
    )).rows[0];
    await expect(db.query("update payments set amount = 200 where id = $1", [payment.id])).rejects.toThrow(/PAYMENT_REASON_REQUIRED/);
    await expect(db.query("select correct_manual_payment($1,1,farm_today(),101.001,'cash',$2,'Ghalat raqam')", [payment.id, farmCash])).rejects.toThrow(/PAYMENT_INVALID/);
    expect((await db.query<{ revision: number }>("select correct_manual_payment($1,1,farm_today(),125,'cash',$2,'Raqam durust ki') as revision", [payment.id, farmCash])).rows[0].revision).toBe(2);
    await expect(db.query("select correct_manual_payment($1,1,farm_today(),130,'cash',$2,'Dobara')", [payment.id, farmCash])).rejects.toThrow(/PAYMENT_STALE/);
    expect((await db.query("select customer_id, action, reason from payment_audit where payment_id = $1", [payment.id])).rows).toEqual([{ customer_id: ahmed, action: "update", reason: "Raqam durust ki" }]);
    await db.query("select void_manual_payment($1,2,'Duplicate entry')", [payment.id]);
    expect((await db.query("select id from payments where id = $1", [payment.id])).rows).toEqual([]);
    expect((await db.query("select action from payment_audit where payment_id = $1 order by changed_at", [payment.id])).rows).toEqual([{ action: "update" }, { action: "delete" }]);
    const cashPayment = (await db.query<{ id: string }>("select id from payments where delivery_id is not null limit 1")).rows[0].id;
    await expect(db.query("select void_manual_payment($1,1,'Wrong')", [cashPayment])).rejects.toThrow(/AUTO_PAYMENT/);
    await expect(db.query("delete from payments where id = $1", [cashPayment])).rejects.toThrow(/AUTO_PAYMENT/);
  });

  it("keeps discounts out of accounts and blocks locked-month corrections", async () => {
    const discount = (await db.query<{ id: string }>(
      "insert into payments (customer_id,payment_date,amount,kind,note) values ($1,farm_today(),10,'discount','Riayat') returning id", [ahmed],
    )).rows[0].id;
    const report = (await db.query<{ discount: string }>("select discount from customer_month_report(farm_today()) where customer_id = $1", [ahmed])).rows[0];
    expect(Number(report.discount)).toBeGreaterThanOrEqual(10);
    expect((await db.query("select ref_id from account_entries($1) where ref_id = $2", [farmCash, discount])).rows).toEqual([]);
    await db.query("select correct_manual_payment($1,1,farm_today(),15,null,null,'Riayat durust ki')", [discount]);
    const audit = (await db.query<{ old_amount: string; new_amount: string }>(
      "select before_row->>'amount' as old_amount, after_row->>'amount' as new_amount from payment_audit where payment_id = $1", [discount],
    )).rows[0];
    expect([Number(audit.old_amount), Number(audit.new_amount)]).toEqual([10, 15]);
    expect((await db.query("select ref_id from account_entries($1) where ref_id = $2", [farmCash, discount])).rows).toEqual([]);
    await expect(db.query("insert into payments (customer_id,payment_date,amount,kind,method,account_id) values ($1,farm_today(),10,'discount','cash',$2)", [ahmed, farmCash])).rejects.toThrow(/DISCOUNT_ACCOUNT/);
    const oldDate = (await db.query<{ day: string }>("select (farm_today() - interval '2 months')::date as day")).rows[0].day;
    const oldPayment = (await db.query<{ id: string }>("insert into payments (customer_id,payment_date,amount,method,account_id) values ($1,$2,10,'cash',$3) returning id", [ahmed, oldDate, farmCash])).rows[0].id;
    await db.query("insert into month_locks (month, note) values (date_trunc('month',$1::date)::date,'Test lock')", [oldDate]);
    await expect(db.query("select void_manual_payment($1,1,'Wrong')", [oldPayment])).rejects.toThrow(/MONTH_LOCKED/);
    await expect(db.query("insert into cash_counts (account_id,count_date,counted_amount,reason) values ($1,$2,0,'Test')", [farmCash, oldDate])).rejects.toThrow(/MONTH_LOCKED/);
    await expect(db.query("insert into transfers (transfer_date,from_account_id,to_account_id,amount) values ($1,$2,$3,1)", [oldDate, farmCash, bank])).rejects.toThrow(/MONTH_LOCKED/);
  });

  it("keeps new financial records owner-only when demo access is off", async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const stranger = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id) values ($1),($2)", [owner, stranger]);
    await db.query("insert into private.app_owner(user_id) values ($1)", [owner]);
    await db.exec("set role anon");
    try {
      await expect(db.query("select id from cash_counts")).rejects.toThrow();
      await expect(db.query("select id from payment_audit")).rejects.toThrow();
      await expect(db.query("select account_balance_on($1, farm_today())", [farmCash])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${stranger}'; set role authenticated`);
    try {
      expect((await db.query("select id from cash_counts")).rows).toEqual([]);
      await expect(db.query("insert into cash_counts(account_id,count_date,counted_amount,reason) values ($1,farm_today(),0,'Test')", [farmCash])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
    await db.exec(`set request.jwt.claim.sub = '${owner}'; set role authenticated`);
    try {
      expect((await db.query("select id from cash_counts")).rows.length).toBeGreaterThan(0);
      expect((await db.query("select id from payment_audit")).rows.length).toBeGreaterThan(0);
    } finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
  });
});
