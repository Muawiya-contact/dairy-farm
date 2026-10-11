import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";

test("only the designated owner can read or write farm data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    for (const file of [
      "20261011000001_schema.sql", "20261011000002_reports.sql",
      "20261011000003_rls.sql", "20261011000004_defaults.sql",
    ]) {
      await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
    }
    await db.exec(`
      insert into auth.users (id) values ('${owner}'), ('${stranger}');
      insert into private.app_owner (user_id) values ('${owner}');
      set role authenticated;
      set request.jwt.claim.sub = '${owner}';
    `);
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    await db.exec("insert into animals (tag) values ('B-001')");
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);

    await db.exec(`set request.jwt.claim.sub = '${stranger}'`);
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    expect((await db.query("select tag from animal_status")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('B-002')")).rejects.toThrow();
    await expect(db.query("select user_id from private.app_owner")).rejects.toThrow();

    await db.exec("set role anon");
    await expect(db.query("select id from settings")).rejects.toThrow();
  } finally {
    await db.close();
  }
});
