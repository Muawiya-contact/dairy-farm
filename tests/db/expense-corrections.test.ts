import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("audits a manual correction once, updates account money, and rejects stale or direct edits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    const account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
    const category = (await db.query<{ id: string }>("select id from expense_categories where active and is_farm_cost and not is_salary limit 1")).rows[0].id;
    const expense = (await db.query<{ id: string }>("insert into expenses(expense_date,category_id,account_id,amount,note) values (farm_today(),$1,$2,100,'Old') returning id", [category, account])).rows[0].id;
    await expect(db.query("update expenses set amount=200 where id=$1", [expense])).rejects.toThrow(/EXPENSE_USE_CORRECTION/);
    const request = "22222222-2222-4222-8222-222222222222";
    const sql = "select correct_expense($1,$2,1,farm_today(),$3,$4,125,'Corrected','Raqam ghalat thi') as revision";
    expect((await db.query(sql, [request, expense, category, account])).rows).toEqual([{ revision: 2 }]);
    expect((await db.query(sql, [request, expense, category, account])).rows).toEqual([{ revision: 2 }]);
    expect((await db.query("select amount,revision from expenses where id=$1", [expense])).rows).toEqual([{ amount: "125.00", revision: 2 }]);
    expect((await db.query("select count(*)::int as count from expense_audit where expense_id=$1", [expense])).rows).toEqual([{ count: 1 }]);
    await expect(db.query(sql, ["33333333-3333-4333-8333-333333333333", expense, category, account])).rejects.toThrow(/EXPENSE_STALE/);
    await expect(db.query("select correct_expense($1,$2,2,farm_today(),$3,$4,-1,null,'Negative amount')", ["44444444-4444-4444-8444-444444444444", expense, category, account])).rejects.toThrow(/EXPENSE_CORRECTION_INVALID/);
  } finally { await db.close(); }
}, 30_000);
