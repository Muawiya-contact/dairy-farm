import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
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
  for (const name of readdirSync(resolve("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
  }
  await db.exec(readFileSync(resolve("supabase/seed/dev-demo.sql"), "utf8"));
}, 30_000);

afterAll(async () => { await db?.close(); });

async function expectRejected(sql: string, params: unknown[], reason: RegExp) {
  await db.exec("savepoint invalid_customer_entry");
  try { await expect(db.query(sql, params)).rejects.toThrow(reason); }
  finally {
    await db.exec("rollback to savepoint invalid_customer_entry");
    await db.exec("release savepoint invalid_customer_entry");
  }
}

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

describe("customer opening dates and price history", () => {
  it("keeps used prices fixed while allowing an unchanged retry and a scheduled future rate", async () => {
    await db.exec("begin");
    try {
      const customer = (await db.query<{ create_customer: string }>(`
        select public.create_customer('Price history QA', 'regular', '', 0, 0, 150, 0,
                                      public.farm_today() - 7, null)`, [])).rows[0].create_customer;
      await db.query("update public.customers set opening_balance = 25 where id = $1", [customer]);
      await db.query(`insert into public.milk_deliveries (delivery_date, shift, customer_id, litres)
                      values (public.farm_today() - 2, 'morning', $1, 2)`, [customer]);
      await db.query(`insert into public.customer_rates (customer_id, rate, effective_from)
                      values ($1, 150, public.farm_today() - 7)
                      on conflict (customer_id, effective_from) do update set rate = excluded.rate`, [customer]);
      await expectRejected(`insert into public.customer_rates (customer_id, rate, effective_from)
        values ($1, 175, public.farm_today() - 3)`, [customer], /RATE_ALREADY_USED/);
      await expectRejected(`insert into public.customer_rates (customer_id, rate, effective_from)
        values ($1, 175, public.farm_today() - 7)
        on conflict (customer_id, effective_from) do update set rate = excluded.rate`, [customer], /RATE_ALREADY_USED/);
      await db.query(`insert into public.customer_rates (customer_id, rate, effective_from)
                      values ($1, 180, public.farm_today() + 1)`, [customer]);
      const result = await db.query<{ today_rate: string; tomorrow_rate: string; saved_amount: string }>(`
        select public.rate_on($1, public.farm_today()) today_rate,
               public.rate_on($1, public.farm_today() + 1) tomorrow_rate,
               (select amount from public.milk_deliveries where customer_id = $1) saved_amount`, [customer]);
      expect(result.rows[0]).toMatchObject({ today_rate: "150.00", tomorrow_rate: "180.00", saved_amount: "300.00" });
      await expectRejected(`update public.customers set opening_date = public.farm_today() - 10
                            where id = $1`, [customer], /CUSTOMER_OPENING_IN_USE/);
      await expectRejected("update public.customers set opening_balance = 50 where id = $1", [customer], /CUSTOMER_BALANCE_IN_USE/);
      await expectRejected("update public.customers set kind = 'company' where id = $1", [customer], /CUSTOMER_KIND_IMMUTABLE/);
    } finally { await db.exec("rollback"); }
  });

  it("rejects entries before opening for deliveries, payments, and company slips", async () => {
    await db.exec("begin");
    try {
      const regular = (await db.query<{ create_customer: string }>(`
        select public.create_customer('Opening QA', 'regular', '', 0, 0, 150, 0,
                                      public.farm_today() - 7)`, [])).rows[0].create_customer;
      const company = (await db.query<{ create_customer: string }>(`
        select public.create_customer('Company opening QA', 'company', '', 0, 0, 0, 0,
                                      public.farm_today() - 7)`, [])).rows[0].create_customer;
      const account = (await db.query<{ id: string }>("select id from public.accounts where is_farm_cash")).rows[0].id;
      await expectRejected(`insert into public.milk_deliveries (delivery_date, shift, customer_id, litres)
        values (public.farm_today() - 8, 'morning', $1, 1)`, [regular], /CUSTOMER_BEFORE_OPENING/);
      await expectRejected(`insert into public.payments (customer_id, payment_date, amount, method, account_id)
        values ($1, public.farm_today() - 8, 100, 'cash', $2)`, [regular, account], /CUSTOMER_BEFORE_OPENING/);
      await expectRejected(`insert into public.company_bills (customer_id, from_date, to_date, litres, amount)
        values ($1, public.farm_today() - 8, public.farm_today() - 1, 10, 1500)`, [company], /CUSTOMER_BEFORE_OPENING/);
      await expectRejected(`insert into public.customer_rates (customer_id, rate, effective_from)
        values ($1, 200, public.farm_today() - 8)`, [regular], /RATE_BEFORE_CUSTOMER_OPENING/);
    } finally { await db.exec("rollback"); }
  });

  it("stores a chosen free reason atomically and rejects invalid ones", async () => {
    await db.exec("begin");
    try {
      const customer = (await db.query<{ create_customer: string }>(`
        select public.create_customer('Free reason QA', 'free', '', 1, 1, 0, 0,
                                      public.farm_today(), 'owner')`, [])).rows[0].create_customer;
      const reason = (await db.query<{ free_reason: string }>(
        "select free_reason from public.customers where id = $1", [customer])).rows[0].free_reason;
      expect(reason).toBe("owner");
      await expectRejected(`select public.create_customer('Invalid reason QA', 'free', '', 1, 1, 0, 0,
        public.farm_today(), 'invalid')`, [], /CUSTOMER_FREE_REASON/);
      expect(Number((await db.query<{ count: string }>(
        "select count(*) from public.customers where name = 'Invalid reason QA'")).rows[0].count)).toBe(0);
    } finally { await db.exec("rollback"); }
  });
});
