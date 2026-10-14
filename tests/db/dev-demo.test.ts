import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DATASETS } from "../../src/lib/export-data";

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
    "20261012000010_customer_opening_balance.sql",
    "20261012000011_health_event_expense.sql",
    "20261013000012_farm_cash_active.sql",
    "20261013000013_close_animal.sql",
    "20261013000014_animal_exit_activity.sql",
    "20261013000015_guard_animal_history_edits.sql",
    "20261013000016_breeding_records.sql",
    "20261013000017_insemination_dry_date.sql",
    "20261013000018_guard_breeding_subjects.sql",
    "20261014000019_farm_contact_phone.sql",
    "20261014000020_preserve_milk_entry_ids.sql",
    "20261014000021_galla_workflow.sql",
  ]) {
    await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
  }
  await db.exec(readFileSync(resolve("supabase/seed/dev-demo.sql"), "utf8"));
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("staging demo seed", () => {
  it("exports only real columns from every public data table", async () => {
    const result = await db.query<{ table_name: string; column_name: string }>(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public'
    `);
    const actual = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const dataset of DATASETS) {
      expect(actual.has(`${dataset.table}.${dataset.key}`), `${dataset.table} sort key`).toBe(true);
      for (const column of dataset.columns) {
        expect(actual.has(`${dataset.table}.${column}`), `${dataset.table}.${column}`).toBe(true);
      }
    }
  });
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

  it("keeps delivery and cash receipt IDs when an old shift is edited", async () => {
    const shift = (await db.query<{ milk_date: string; total_litres: string }>(`
      select milk_date, total_litres from milk_shifts
      where milk_date = farm_today() - 1 and shift = 'morning'`)).rows[0];
    const before = (await db.query<{ id: string; customer_id: string; litres: string; payment_id: string | null; kind: string }>(`
      select d.id, d.customer_id, d.litres, p.id as payment_id, c.kind
      from milk_deliveries d join customers c on c.id = d.customer_id
      left join payments p on p.delivery_id = d.id
      where d.delivery_date = $1 and d.shift = 'morning'
      order by d.customer_id`, [shift.milk_date])).rows;
    const cash = before.find((row) => row.kind === "cash")!;
    const company = before.find((row) => row.kind === "company")!;
    const deliveries = before.map((row) => ({
      customer_id: row.customer_id,
      litres: Number(row.litres) + (row.kind === "cash" ? 1 : row.kind === "company" ? -1 : 0),
    }));
    await db.query("select save_milk_entry($1::date, 'morning', $2::numeric, 'total', '[]'::jsonb, $3::jsonb)",
      [shift.milk_date, shift.total_litres, JSON.stringify(deliveries)]);
    const after = (await db.query<{ id: string; customer_id: string; litres: string; payment_id: string | null; payment_amount: string | null }>(`
      select d.id, d.customer_id, d.litres, p.id as payment_id, p.amount as payment_amount
      from milk_deliveries d left join payments p on p.delivery_id = d.id
      where d.delivery_date = $1 and d.shift = 'morning'
      order by d.customer_id`, [shift.milk_date])).rows;
    expect(after.map((row) => [row.customer_id, row.id])).toEqual(before.map((row) => [row.customer_id, row.id]));
    expect(after.find((row) => row.customer_id === cash.customer_id)).toMatchObject({
      id: cash.id, payment_id: cash.payment_id, litres: "4.00", payment_amount: "600.00",
    });
    expect(after.find((row) => row.customer_id === company.customer_id)).toMatchObject({ id: company.id, litres: "35.00" });
  });

  it("keeps per-animal milk IDs when a shift is corrected", async () => {
    const animals = (await db.query<{ id: string }>("select id from animals where tag in ('101', '102') order by tag")).rows;
    const date = (await db.query<{ today: string }>("select farm_today() as today")).rows[0].today;
    const save = (litres: number[]) => db.query(
      "select save_milk_entry($1::date, 'morning', 8, 'per_animal', $2::jsonb, '[]'::jsonb)",
      [date, JSON.stringify(animals.map((animal, index) => ({ animal_id: animal.id, litres: litres[index] })))],
    );
    await save([5, 3]);
    const before = (await db.query<{ id: string; animal_id: string }>(
      "select id, animal_id from animal_milk where shift_id = (select id from milk_shifts where milk_date = $1 and shift = 'morning') order by animal_id", [date],
    )).rows;
    await db.exec("update animals set milking_status = 'dry' where tag = '101'");
    await save([6, 2]);
    const after = (await db.query<{ id: string; animal_id: string; litres: string }>(
      "select id, animal_id, litres from animal_milk where shift_id = (select id from milk_shifts where milk_date = $1 and shift = 'morning') order by animal_id", [date],
    )).rows;
    expect(after.map(({ id, animal_id }) => ({ id, animal_id }))).toEqual(before);
    expect(after.map((row) => row.litres).sort()).toEqual(["2.00", "6.00"]);
    expect((await db.query<{ total_litres: string }>("select total_litres from milk_shifts where milk_date = $1 and shift = 'morning'", [date])).rows[0].total_litres).toBe("8.00");
    await expect(db.query("select save_milk_entry($1::date, 'evening', 1, 'total', '[]'::jsonb, $2::jsonb)",
      [date, JSON.stringify([{ customer_id: animals[0].id, litres: -1 }])])).rejects.toThrow(/negative/);
  });
});
