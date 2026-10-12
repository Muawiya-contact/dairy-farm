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
      "20261011000005_open_preview.sql",
    ]) {
      await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
    }
    // Simulate a preview policy already deployed on one table before restoring it.
    await db.exec(`
      alter policy owner_all on settings rename to preview_all;
      alter policy preview_all on settings to anon, authenticated using (true) with check (true);
      grant select, update on settings to anon;
    `);
    await db.exec(readFileSync(resolve(migrationDir, "20261011000006_restore_owner_policy.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000007_demo_settings.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000008_live_app_data.sql"), "utf8"));
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
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("update settings set farm_name = 'Blocked' where id = 1 returning id")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('B-002')")).rejects.toThrow();

    await db.exec("reset role; update private.demo_access set enabled = true where id = 1; set role anon");
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    await db.exec("update settings set farm_name = 'Shared Demo' where id = 1");
    expect((await db.query("select farm_name from settings")).rows).toEqual([{ farm_name: "Shared Demo" }]);
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);
    await db.exec("insert into animals (tag) values ('B-002')");
    expect((await db.query("select tag from animals order by tag")).rows).toEqual([{ tag: "B-001" }, { tag: "B-002" }]);
    await db.exec("select public.save_milk_entry(public.farm_today(), 'morning', 10, 'total', '[]'::jsonb, '[]'::jsonb)");
    expect((await db.query("select total_litres from milk_shifts")).rows).toEqual([{ total_litres: "10.00" }]);

    await db.exec("reset role; update private.demo_access set enabled = false where id = 1; set role anon");
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("update settings set farm_name = 'Blocked' where id = 1 returning id")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
  } finally {
    await db.close();
  }
});
