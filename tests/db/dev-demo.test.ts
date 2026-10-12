import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let db: PGlite;

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
  for (const name of [
    "20261011000001_schema.sql",
    "20261011000002_reports.sql",
    "20261011000003_rls.sql",
    "20261011000004_defaults.sql",
    "20261011000005_open_preview.sql",
    "20261011000006_restore_owner_policy.sql",
    "20261012000007_demo_settings.sql",
    "20261012000008_live_app_data.sql",
    "20261012000009_create_customer.sql",
  ]) {
    await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
  }
  await db.exec(readFileSync(resolve("supabase/seed/dev-demo.sql"), "utf8"));
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("staging demo seed", () => {
  it("balances all 14 days of milk production and delivery", async () => {
    const { rows } = await db.query<{ produced: number; delivered: number }>(`
      select sum(total_litres) produced,
             (select sum(litres) from milk_deliveries) delivered
      from milk_shifts`);
    expect(Number(rows[0].produced)).toBe(14 * 150);
    expect(Number(rows[0].delivered)).toBe(14 * 150);
  });

  it("gives Farm galla the expected balance after demo transactions", async () => {
    const { rows } = await db.query<{ balance: number }>(`
      select a.opening_balance + coalesce(sum(e.money_in - e.money_out), 0) balance
      from accounts a left join lateral account_entries(a.id) e on true
      where a.is_farm_cash group by a.opening_balance`);
    expect(Number(rows[0].balance)).toBe(7500);
  });

  it("provides the planned herd alerts", async () => {
    const { rows } = await db.query<{ alert_kind: string; tag: string }>(
      "select alert_kind, tag from herd_alerts(farm_today())",
    );
    expect(rows.map((row) => `${row.alert_kind}:${row.tag}`).sort()).toEqual([
      "calving:103", "health:106", "ultrasound:104",
    ]);
  });

  it("gives Ahmed the expected outstanding balance", async () => {
    const { rows } = await db.query<{ balance: number }>(
      "select balance from customer_balances where name = 'Ahmed'",
    );
    expect(Number(rows[0].balance)).toBe(23000);
  });

  it("keeps demo customers private until staging access is enabled", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select name from customers")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});
