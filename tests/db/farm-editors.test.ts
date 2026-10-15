import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const secondEditor = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";

test("only the owner and explicitly added editors can use farm data", async () => {
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
    for (const name of [
      "20261011000001_schema.sql",
      "20261011000002_reports.sql",
      "20261011000003_rls.sql",
      "20261015000043_farm_editors.sql",
    ]) {
      await db.exec(readFileSync(resolve(migrations, name), "utf8"));
    }
    await db.exec(`
      insert into auth.users (id) values ('${owner}'), ('${editor}'), ('${secondEditor}'), ('${outsider}');
      insert into private.app_owner (user_id) values ('${owner}');
      set role authenticated;
      set request.jwt.claim.sub = '${owner}';
    `);
    await db.exec("insert into animals (tag) values ('OWNER')");

    await db.exec(`set request.jwt.claim.sub = '${editor}'`);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('BLOCKED')")).rejects.toThrow();
    await expect(db.query("select user_id from private.app_editors")).rejects.toThrow();

    await db.exec(`reset role; insert into private.app_editors (user_id) values ('${editor}'), ('${secondEditor}'); set role authenticated`);
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "OWNER" }]);
    await db.exec("insert into animals (tag) values ('EDITOR')");

    await db.exec(`set request.jwt.claim.sub = '${secondEditor}'`);
    expect((await db.query("select tag from animals order by tag")).rows).toEqual([{ tag: "EDITOR" }, { tag: "OWNER" }]);
    await db.exec("update animals set breed = 'Holstein' where tag = 'EDITOR'");
    expect((await db.query("select breed from animals where tag = 'EDITOR'")).rows).toEqual([{ breed: "Holstein" }]);

    await db.exec(`set request.jwt.claim.sub = '${outsider}'`);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('BLOCKED')")).rejects.toThrow();

    await db.exec("set role anon");
    await expect(db.query("select tag from animals")).rejects.toThrow();
    await expect(db.exec("insert into animals (tag) values ('BLOCKED')")).rejects.toThrow();

    await db.exec(`reset role; delete from auth.users where id = '${editor}'; set role authenticated; set request.jwt.claim.sub = '${editor}'`);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
  } finally {
    await db.close();
  }
});
