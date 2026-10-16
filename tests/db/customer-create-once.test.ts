import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("returns the same customer for a retried request and rejects changed payloads", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111";
    const request = "22222222-2222-4222-8222-222222222222";
    await db.exec(`insert into auth.users(id) values ('${owner}'); insert into private.app_owner(user_id) values ('${owner}');
      set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    const sql = "select create_customer_once($1, $2, 'regular', '', 0, 1, 150, 0, farm_today(), null) as id";
    const first = (await db.query<{ id: string }>(sql, [request, "Retry QA"])).rows[0].id;
    expect((await db.query<{ id: string }>(sql, [request, "Retry QA"])).rows[0].id).toBe(first);
    expect((await db.query("select count(*)::int as count from customers where id = $1", [first])).rows).toEqual([{ count: 1 }]);
    expect((await db.query("select count(*)::int as count from customer_rates where customer_id = $1", [first])).rows).toEqual([{ count: 1 }]);
    await expect(db.query(sql, [request, "Changed name"])).rejects.toThrow(/CUSTOMER_REQUEST_CHANGED/);
    await expect(db.query(sql, ["33333333-3333-4333-8333-333333333333", "Retry QA"])).rejects.toThrow(/customers_name_uq/);
    await expect(db.exec("select * from private.customer_create_requests")).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);
