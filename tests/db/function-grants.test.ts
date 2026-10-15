import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("production never grants anonymous access to write RPCs", async () => {
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
      alter default privileges in schema public grant all on tables to anon;
      alter default privileges in schema public grant execute on functions to anon;
    `);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    }
    const signatures = [
      "public.save_milk_entry(date,text,numeric,text,jsonb,jsonb)",
      "public.save_milk_entry_checked(date,text,numeric,text,jsonb,jsonb,timestamp with time zone,text)",
      "public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text)",
      "public.record_health_event(uuid,date,text,text,numeric,date,uuid,uuid)",
      "public.close_animal(uuid,text,date,text,numeric,uuid)",
      "public.record_calving(uuid,date,text,text)",
      "public.record_calving_with_offspring(uuid,uuid,date,jsonb,smallint,text)",
    ];
    for (const signature of signatures) {
      const { rows } = await db.query<{ allowed: boolean }>(
        "select has_function_privilege('anon', $1, 'EXECUTE') as allowed", [signature]);
      expect(rows[0].allowed, signature).toBe(false);
      const { rows: ownerRows } = await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated', $1, 'EXECUTE') as allowed", [signature]);
      expect(ownerRows[0].allowed, signature).toBe(true);
    }
    const { rows: exposedTables } = await db.query<{ table_name: string }>(`
      select c.relname as table_name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE'))
    `);
    expect(exposedTables).toEqual([]);
    await db.exec(`
      create function public.permission_probe() returns integer language sql as $$ select 1 $$;
      create table public.permission_probe_table (id integer);
    `);
    const { rows: futureGrants } = await db.query<{ function_allowed: boolean; table_allowed: boolean }>(`
      select has_function_privilege('anon', 'public.permission_probe()', 'EXECUTE') as function_allowed,
             has_table_privilege('anon', 'public.permission_probe_table', 'SELECT') as table_allowed
    `);
    expect(futureGrants).toEqual([{ function_allowed: false, table_allowed: false }]);
  } finally { await db.close(); }
}, 30_000);
