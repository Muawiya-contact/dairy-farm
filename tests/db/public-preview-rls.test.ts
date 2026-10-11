import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const user = "11111111-1111-4111-8111-111111111111";

test("visitors without login can read and write shared preview data", async () => {
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
      "20261011000005_open_preview.sql",
      "20261011000006_public_preview.sql",
    ]) {
      await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
    }
    await db.exec(`
      insert into auth.users (id) values ('${user}');
      set role anon;
    `);
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    await db.exec("update settings set farm_name = 'Test Farm' where id = 1");
    expect((await db.query("select farm_name from settings")).rows).toEqual([{ farm_name: "Test Farm" }]);
    await db.exec("insert into animals (tag) values ('B-001')");
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);
    expect((await db.query("select tag from animal_status")).rows).toEqual([{ tag: "B-001" }]);
    expect((await db.query("select farm_today() as today")).rows).toHaveLength(1);
    await expect(db.query("select user_id from private.app_owner")).rejects.toThrow();

    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${user}';
    `);
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);
    await db.exec("insert into animals (tag) values ('B-002')");
    await db.exec("set role anon");
    expect((await db.query("select tag from animals order by tag")).rows).toEqual([
      { tag: "B-001" }, { tag: "B-002" },
    ]);
  } finally {
    await db.close();
  }
});
