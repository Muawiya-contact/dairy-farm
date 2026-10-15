import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
const migrationDir = resolve("supabase/migrations");
const lifecycleMigrations = [
  "20261015000029_animal_lifecycle.sql",
  "20261015000030_guard_animal_sale_ledger.sql",
  "20261015000031_breeding_register_offspring.sql",
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql") && !lifecycleMigrations.includes(name)).sort())
    await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
  await db.exec("insert into animals (tag, source, purchase_date) values ('LEGACY', 'purchased', farm_today() - 100), ('UNKNOWN', 'purchased', null)");
  for (const file of lifecycleMigrations) await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
}, 30_000);

afterAll(async () => { await db?.close(); });

it("backfills only known historical arrival dates", async () => {
  const rows = (await db.query<{ tag: string; arrival_date: string | null }>("select tag, arrival_date from animals where tag in ('LEGACY','UNKNOWN') order by tag")).rows;
  expect(rows[0].arrival_date).not.toBeNull();
  expect(rows[1].arrival_date).toBeNull();
});

it("requires new arrivals and rejects future, contradictory and impossible ages", async () => {
  await expect(db.exec("insert into animals (tag) values ('NO-DATE')")).rejects.toThrow(/ANIMAL_ARRIVAL_REQUIRED/);
  await expect(db.exec("insert into animals (tag, arrival_date) values ('FUTURE', farm_today() + 1)")).rejects.toThrow(/ANIMAL_FUTURE_DATE/);
  await expect(db.exec("insert into animals (tag, source, arrival_date, birth_date) values ('BORN', 'born', farm_today(), farm_today() - 1)")).rejects.toThrow(/ANIMAL_BIRTH_ARRIVAL/);
  await expect(db.exec("insert into animals (tag, arrival_date, estimated_age_months_at_arrival) values ('TOO-OLD', farm_today(), 601)")).rejects.toThrow(/animals_estimated_age_range/);
  await expect(db.exec("insert into animals (tag, arrival_date, birth_date, estimated_age_months_at_arrival) values ('DOUBLE-AGE', farm_today(), farm_today() - 1, 12)")).rejects.toThrow(/animals_age_evidence_exclusive/);
  await db.exec("insert into animals (tag, source, arrival_date, estimated_age_months_at_arrival) values ('GIFT', 'gift', farm_today() - 20, 30)");
  expect((await db.query("select source, estimated_age_months_at_arrival from animals where tag = 'GIFT'")).rows)
    .toEqual([{ source: "gift", estimated_age_months_at_arrival: 30 }]);
});

it("preserves dated activity and records other departures without money movement", async () => {
  const id = (await db.query<{ id: string }>("select id from animals where tag = 'GIFT'")).rows[0].id;
  await db.query("insert into health_events (animal_id, event_date, kind, title) values ($1, farm_today() - 10, 'checkup', 'Inspection')", [id]);
  await expect(db.query("update animals set arrival_date = farm_today() - 5 where id = $1", [id]))
    .rejects.toThrow(/ANIMAL_ARRIVAL_AFTER_ACTIVITY/);
  await expect(db.query("select close_animal($1, 'removed', farm_today(), '', null, null)", [id]))
    .rejects.toThrow(/Invalid animal exit/);
  await expect(db.query("select close_animal($1, 'removed', farm_today() - 30, 'Moved', null, null)", [id]))
    .rejects.toThrow();
  await db.query("select close_animal($1, 'removed', farm_today(), 'Doosre farm bheja', null, null)", [id]);
  expect((await db.query("select life_status, exit_reason, sale_price from animals where id = $1", [id])).rows)
    .toEqual([{ life_status: "removed", exit_reason: "Doosre farm bheja", sale_price: null }]);
  expect((await db.query("select count(*)::int as count from other_income where animal_id = $1", [id])).rows)
    .toEqual([{ count: 0 }]);
});

it("rejects milk, health and breeding entries before arrival", async () => {
  const id = (await db.query<{ id: string }>("select id from animals where tag = 'LEGACY'")).rows[0].id;
  await expect(db.query("insert into health_events (animal_id, event_date, kind, title) values ($1, farm_today() - 101, 'checkup', 'Too early')", [id]))
    .rejects.toThrow(/ANIMAL_OUTSIDE_FARM_DATES/);
  await expect(db.query("insert into inseminations (animal_id, service_date, semen_type) values ($1, farm_today() - 101, 'natural')", [id]))
    .rejects.toThrow(/BREEDING_OUTSIDE_LIFETIME/);
  const shift = (await db.query<{ id: string }>("insert into milk_shifts (milk_date, shift, mode, total_litres) values (farm_today() - 101, 'morning', 'per_animal', 0) returning id")).rows[0].id;
  await expect(db.query("insert into animal_milk (shift_id, animal_id, litres) values ($1, $2, 1)", [shift, id]))
    .rejects.toThrow(/ANIMAL_BEFORE_ARRIVAL/);
});

it("records a sale once in the receiving account", async () => {
  const account = (await db.query<{ id: string }>("insert into accounts (name, kind) values ('QA sale cash', 'cash') returning id")).rows[0].id;
  const animal = (await db.query<{ id: string }>("insert into animals (tag, arrival_date) values ('SALE-QA', farm_today() - 3) returning id")).rows[0].id;
  await expect(db.query("update animals set life_status = 'sold', exit_date = farm_today(), sale_price = 1250 where id = $1", [animal]))
    .rejects.toThrow(/ANIMAL_EXIT_USE_RPC/);
  await expect(db.query("insert into other_income (income_date, kind, amount, account_id, animal_id) values (farm_today(), 'animal_sale', 1250, $1, $2)", [account, animal]))
    .rejects.toThrow(/ANIMAL_SALE_USE_RPC/);
  const inactive = (await db.query<{ id: string }>("insert into accounts (name, kind, active) values ('Inactive sale account', 'cash', false) returning id")).rows[0].id;
  await expect(db.query("select close_animal($1, 'sold', farm_today(), '', 1250, $2)", [animal, inactive]))
    .rejects.toThrow(/ANIMAL_SALE_ACCOUNT_UNAVAILABLE/);
  await expect(db.query("select close_animal($1, 'sold', farm_today(), '', 1250.001, $2)", [animal, account]))
    .rejects.toThrow(/Invalid animal exit/);
  expect((await db.query("select life_status from animals where id = $1", [animal])).rows)
    .toEqual([{ life_status: "active" }]);
  await db.query("select close_animal($1, 'sold', farm_today(), 'QA sale', 1250, $2)", [animal, account]);
  await expect(db.query("select close_animal($1, 'sold', farm_today(), 'Repeat', 1250, $2)", [animal, account])).rejects.toThrow(/Active animal not found/);
  await expect(db.query("update animals set life_status = 'active', exit_date = null, sale_price = null where id = $1", [animal]))
    .rejects.toThrow(/ANIMAL_EXIT_IMMUTABLE/);
  await expect(db.query("update animals set sale_price = 1400 where id = $1", [animal]))
    .rejects.toThrow(/ANIMAL_EXIT_IMMUTABLE/);
  await expect(db.query("update other_income set amount = 1400 where animal_id = $1", [animal]))
    .rejects.toThrow(/ANIMAL_SALE_IMMUTABLE/);
  await expect(db.query("delete from other_income where animal_id = $1", [animal]))
    .rejects.toThrow(/ANIMAL_SALE_IMMUTABLE/);
  expect((await db.query("select kind, amount, account_id from other_income where animal_id = $1", [animal])).rows)
    .toEqual([{ kind: "animal_sale", amount: "1250.00", account_id: account }]);
});

it("still allows ordinary income and profile edits without altering a sale", async () => {
  const account = (await db.query<{ id: string }>("select id from accounts where name = 'QA sale cash'")).rows[0].id;
  const id = (await db.query<{ id: string }>("select id from animals where tag = 'SALE-QA'")).rows[0].id;
  await db.query("update animals set notes = 'Sold to another farm' where id = $1", [id]);
  await db.query("insert into other_income (income_date, kind, amount, account_id) values (farm_today(), 'other', 250, $1)", [account]);
  expect((await db.query("select count(*)::int as count from other_income where animal_id = $1 and kind = 'animal_sale'", [id])).rows)
    .toEqual([{ count: 1 }]);
});
