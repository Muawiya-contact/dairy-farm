import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export async function freshFarmDb(options: { farmDay?: string; demo?: boolean; demoAccess?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  try {
    if (options.farmDay && !/^\d{4}-\d{2}-\d{2}$/.test(options.farmDay)) throw new RangeError("Use an ISO farm day");
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    const dir = resolve("supabase/migrations");
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(resolve(dir, name), "utf8"));
      if (options.demoAccess && name === "20261012000007_demo_settings.sql") {
        await db.exec("update private.demo_access set enabled = true where id = 1");
      }
      // The first migration creates farm_today(); later migrations seed dated
      // rows from it, so freeze the clock before those migrations run.
      if (options.farmDay && name === "20261011000001_schema.sql") {
        await db.exec(`create or replace function public.farm_today() returns date language sql stable
          as $$ select date '${options.farmDay}' $$`);
      }
    }
    if (options.demo) await db.exec(readFileSync(resolve("supabase/seed/dev-demo.sql"), "utf8"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
