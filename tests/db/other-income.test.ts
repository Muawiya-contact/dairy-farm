import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("records manure in Galla and profit while rejecting invalid manual income", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    const account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
    const before = (await db.query<{ total_income: string }>("select total_income from pnl_month(farm_today())")).rows[0];
    await db.query("insert into other_income(income_date,kind,amount,account_id) values (farm_today(),'manure',125,$1)", [account]);
    const after = (await db.query<{ total_income: string }>("select total_income from pnl_month(farm_today())")).rows[0];
    expect(Number(after.total_income) - Number(before.total_income)).toBe(125);
    await expect(db.query("insert into other_income(income_date,kind,amount,account_id) values (farm_today()+1,'other',1,$1)", [account])).rejects.toThrow(/FUTURE_DATE/);
    await expect(db.query("insert into other_income(income_date,kind,amount,account_id,animal_id) values (farm_today(),'manure',1,$1,gen_random_uuid())", [account])).rejects.toThrow();
    await expect(db.query("insert into other_income(income_date,kind,amount,account_id) values (farm_today(),'animal_sale',1,$1)", [account])).rejects.toThrow(/ANIMAL_SALE_USE_RPC/);
  } finally { await db.close(); }
}, 30_000);
