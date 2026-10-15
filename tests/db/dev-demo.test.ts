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
  it("leaves Pakistan Eid dates unconfirmed and rejects overlapping saved dates", async () => {
    const { rows } = await db.query<{ eid_fitr_start_date: string | null; eid_adha_start_date: string | null }>(
      "select eid_fitr_start_date, eid_adha_start_date from public.settings where id = 1",
    );
    expect(rows[0]).toEqual({ eid_fitr_start_date: null, eid_adha_start_date: null });
    await db.exec("begin");
    try {
      await expectRejected(
        "update public.settings set eid_fitr_start_date = $1::date, eid_adha_start_date = $2::date where id = 1",
        ["2027-03-10", "2027-03-11"], /settings_eid_dates_separate/,
      );
    } finally { await db.exec("rollback"); }
  });

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

describe("checked daily milk entry", () => {
  const save = `select public.save_milk_entry_checked(coalesce($1::date, public.farm_today()), $2::text, $3::numeric,
    $4::text, $5::jsonb, $6::jsonb, $7::timestamptz, $8::text) as version`;

  it("saves exact per-animal litres, note, delivery and cash receipt; rejects stale corrections", async () => {
    await db.exec("begin");
    try {
      const cows = (await db.query<{ id: string }>("select id from public.animals where tag in ('101', '102') order by tag")).rows;
      const cash = (await db.query<{ id: string }>("select id from public.customers where kind = 'cash' limit 1")).rows[0];
      const animals = JSON.stringify([{ animal_id: cows[0].id, litres: 0.1 }, { animal_id: cows[1].id, litres: 0.2 }]);
      const deliveries = JSON.stringify([{ customer_id: cash.id, litres: 0.2 }]);
      const args = [null, "evening", 0.3, "per_animal", animals, deliveries, null, "Baqi ghar mein istemal hua"];
      const version = (await db.query<{ version: string }>(save, args)).rows[0].version;
      const record = (await db.query<{ total_litres: string; notes: string; paid: string }>(`
        select s.total_litres, s.notes, p.amount as paid
        from public.milk_shifts s
        join public.milk_deliveries d on d.delivery_date = s.milk_date and d.shift = s.shift
        join public.payments p on p.delivery_id = d.id
        where s.milk_date = public.farm_today() and s.shift = 'evening'`)).rows[0];
      expect(record).toMatchObject({ total_litres: "0.30", notes: "Baqi ghar mein istemal hua", paid: "30.00" });
      await expectRejected(save, args, /MILK_STALE/);
      await db.query(save, [null, "evening", 0.3, "per_animal", animals, deliveries, version, "Naya note"]);
      await expectRejected(save, [null, "evening", 0.3, "per_animal", animals, deliveries, version, "Purana note"], /MILK_STALE/);
      expect((await db.query<{ notes: string }>("select notes from public.milk_shifts where milk_date = public.farm_today() and shift = 'evening'")).rows[0].notes).toBe("Naya note");
    } finally { await db.exec("rollback"); }
  });

  it("rejects malformed, duplicate, future, and over-delivered requests without partial rows", async () => {
    await db.exec("begin");
    try {
      const customer = (await db.query<{ id: string }>("select id from public.customers where kind = 'free' limit 1")).rows[0].id;
      const date = (await db.query<{ day: string }>("select (public.farm_today() - 20)::text as day")).rows[0].day;
      const delivery = JSON.stringify([{ customer_id: customer, litres: 1 }]);
      const base = [date, "evening", 1, "total", "[]", delivery, null, ""];
      await expectRejected(save, [date, "evening", 1.001, "total", "[]", delivery, null, ""], /MILK_INVALID/);
      await expectRejected(save, [date, "evening", 1, "total", "[]", JSON.stringify([{ customer_id: customer, litres: 0.5 }, { customer_id: customer, litres: 0.5 }]), null, ""], /MILK_INVALID/);
      await expectRejected(save, [date, "evening", 1, "total", "[]", JSON.stringify([{ customer_id: customer, litres: 2 }]), null, ""], /MILK_INVALID/);
      await expectRejected(save, [date, "evening", 1, "total", "[]", JSON.stringify([{ customer_id: customer, litres: -1 }]), null, ""], /MILK_INVALID/);
      await expectRejected(save, [date, "evening", 1, "total", "[]", "[{}]", null, ""], /MILK_INVALID/);
      await expectRejected(save, [date, "evening", 1, "total", "[]", delivery, null, "x".repeat(501)], /MILK_INVALID/);
      await expectRejected(save, ["2999-01-01", "evening", 1, "total", "[]", delivery, null, ""], /FUTURE_DATE/);
      expect(Number((await db.query<{ count: string }>("select count(*) from public.milk_shifts where milk_date = $1 and shift = 'evening'", [date])).rows[0].count)).toBe(0);
      await db.query(save, base);
      const before = (await db.query<{ version: string }>("select updated_at as version from public.milk_shifts where milk_date = $1 and shift = 'evening'", [date])).rows[0].version;
      await db.query("update public.milk_deliveries set litres = 0.5 where delivery_date = $1 and shift = 'evening'", [date]);
      await expectRejected(save, [...base.slice(0, 6), before, ""], /MILK_STALE/);
    } finally { await db.exec("rollback"); }
  });

  it("respects a closed month and blocks direct future milk writes", async () => {
    await db.exec("begin");
    try {
      await expectRejected("insert into public.milk_shifts (milk_date, shift, total_litres) values (public.farm_today() + 1, 'morning', 1)", [], /FUTURE_DATE/);
      await expectRejected("insert into public.milk_deliveries (delivery_date, shift, customer_id, litres) select public.farm_today() + 1, 'morning', id, 1 from public.customers limit 1", [], /FUTURE_DATE/);
      await db.exec("insert into public.month_locks (month) values (date_trunc('month', public.farm_today())::date)");
      await expectRejected(save, [null, "morning", 0, "total", "[]", "[]", null, ""], /MONTH_LOCKED/);
    } finally { await db.exec("rollback"); }
  });
});

describe("owner month closing", () => {
  it("does not let a signed-in non-owner close a month", async () => {
    await db.exec("begin");
    try {
      await db.exec("set role authenticated");
      await expectRejected("select public.close_farm_month((date_trunc('month', public.farm_today()) - interval '1 month')::date)", [], /MONTH_FORBIDDEN/);
    } finally { await db.exec("reset role"); await db.exec("rollback"); }
  });

  it("records close/reopen decisions and protects a closed ledger from indirect edits", async () => {
    await db.exec("begin");
    try {
      const month = (await db.query<{ month: string }>(
        "select (date_trunc('month', public.farm_today()) - interval '1 month')::date as month",
      )).rows[0].month;
      const owner = "9fb34167-f97d-4938-be7f-ca9a45ef509d";
      await db.query("insert into auth.users(id) values ($1)", [owner]);
      await db.query("insert into private.app_owner(singleton, user_id) values (true, $1)", [owner]);
      const account = (await db.query<{ id: string }>(
        "insert into public.accounts(name, kind, opening_balance, opening_date) values ('Month close QA', 'cash', 100, $1) returning id", [month],
      )).rows[0].id;
      const category = (await db.query<{ id: string }>(
        "insert into public.expense_categories(name, is_farm_cost) values ('Month close QA', true) returning id",
      )).rows[0].id;
      const customer = (await db.query<{ id: string }>(
        "insert into public.customers(name, kind, opening_balance, opening_date) values ('Month close QA', 'regular', 100, $1) returning id", [month],
      )).rows[0].id;
      const shift = (await db.query<{ id: string }>(
        "insert into public.milk_shifts(milk_date, shift, total_litres, mode) values ($1, 'morning', 0, 'total') returning id", [month],
      )).rows[0].id;
      const animal = (await db.query<{ id: string }>("select id from public.animals where tag = '101'")).rows[0].id;
      const secondAnimal = (await db.query<{ id: string }>("select id from public.animals where tag = '102'")).rows[0].id;
      const animalMilk = (await db.query<{ id: string }>(
        "insert into public.animal_milk(shift_id, animal_id, litres) values ($1, $2, 1) returning id", [shift, animal],
      )).rows[0].id;
      await db.query("insert into public.expenses(expense_date, category_id, amount, account_id) values ($1, $2, 1, $3)",
        [month, category, account]);
      await db.exec("set request.jwt.claim.sub = '9fb34167-f97d-4938-be7f-ca9a45ef509d'");
      await db.exec("set role authenticated");
      expect((await db.query<{ changed: boolean }>("select public.close_farm_month($1, 'Mahina check ho gaya') as changed", [month])).rows[0].changed).toBe(true);
      expect((await db.query<{ changed: boolean }>("select public.close_farm_month($1, null) as changed", [month])).rows[0].changed).toBe(false);
      await expectRejected("update public.accounts set opening_balance = 200 where id = $1", [account], /MONTH_LOCKED/);
      await expectRejected("update public.customers set opening_balance = 200 where id = $1", [customer], /MONTH_LOCKED/);
      await expectRejected("update public.animal_milk set litres = 2 where id = $1", [animalMilk], /MONTH_LOCKED/);
      await expectRejected("delete from public.animal_milk where id = $1", [animalMilk], /MONTH_LOCKED/);
      await expectRejected("insert into public.animal_milk(shift_id, animal_id, litres) values ($1, $2, 1)", [shift, secondAnimal], /MONTH_LOCKED/);
      await expectRejected("update public.expense_categories set is_farm_cost = false where id = $1", [category], /MONTH_LOCKED/);
      await expectRejected("delete from public.month_locks where month = $1", [month], /permission denied/);
      await expectRejected("select public.reopen_farm_month($1, 'no')", [month], /MONTH_REASON_REQUIRED/);
      expect((await db.query<{ changed: boolean }>("select public.reopen_farm_month($1, 'Owner correction') as changed", [month])).rows[0].changed).toBe(true);
      expect((await db.query<{ changed: boolean }>("select public.reopen_farm_month($1, 'Owner correction') as changed", [month])).rows[0].changed).toBe(false);
      const events = (await db.query<{ action: string; reason: string }>(
        "select action, reason from public.month_lock_events where month = $1 order by created_at", [month],
      )).rows;
      expect(events).toEqual([
        { action: "close", reason: "Mahina check ho gaya" },
        { action: "reopen", reason: "Owner correction" },
      ]);
      await db.query("update public.accounts set opening_balance = 200 where id = $1", [account]);
    } finally {
      await db.exec("reset role");
      await db.exec("reset request.jwt.claim.sub");
      await db.exec("rollback");
    }
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
      const payment = (await db.query<{ id: string }>(`insert into public.payments
        (customer_id, payment_date, amount, method, account_id)
        values ($1, public.farm_today(), 100, 'cash', $2) returning id`, [regular, account])).rows[0].id;
      await expectRejected(`select public.correct_manual_payment($1, 1, public.farm_today() - 8,
        100, 'cash', $2, 'Wrong date')`, [payment, account], /CUSTOMER_BEFORE_OPENING/);
      await expectRejected("update public.customers set opening_balance = 25 where id = $1",
        [regular], /CUSTOMER_BALANCE_IN_USE/);
      await db.query(`insert into public.company_bills (customer_id, from_date, to_date, litres, amount)
        values ($1, public.farm_today() - 1, public.farm_today(), 10, 1500)`, [company]);
      await expectRejected("update public.customers set opening_balance = 25 where id = $1",
        [company], /CUSTOMER_BALANCE_IN_USE/);
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
