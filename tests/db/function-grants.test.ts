import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("production denies anonymous execution of every public function", async () => {
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
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant execute on functions to anon, authenticated;
    `);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    }
    const { rows: publicFunctions } = await db.query<{ signature: string; anon_execute: boolean }>(`
      select p.oid::regprocedure::text as signature,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by signature
    `);
    expect(publicFunctions.length).toBeGreaterThan(0);
    expect(publicFunctions.filter((fn) => fn.anon_execute).map((fn) => fn.signature)).toEqual([]);
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
    const { rows: privateAccess } = await db.query<{ anon_access: boolean; auth_access: boolean }>(`
      select has_table_privilege('anon', 'private.farm_subscription', 'UPDATE') as anon_access,
             has_table_privilege('authenticated', 'private.farm_subscription', 'UPDATE') as auth_access
    `);
    expect(privateAccess).toEqual([{ anon_access: false, auth_access: false }]);
    await db.exec(`
      create function public.permission_probe() returns integer language sql as $$ select 1 $$;
      create table public.permission_probe_table (id integer);
    `);
    const { rows: futureGrants } = await db.query<{ anon_function: boolean; anon_table: boolean; auth_function: boolean; auth_table: boolean }>(`
      select has_function_privilege('anon', 'public.permission_probe()', 'EXECUTE') as anon_function,
             has_table_privilege('anon', 'public.permission_probe_table', 'SELECT') as anon_table,
             has_function_privilege('authenticated', 'public.permission_probe()', 'EXECUTE') as auth_function,
             has_table_privilege('authenticated', 'public.permission_probe_table', 'SELECT') as auth_table
    `);
    expect(futureGrants).toEqual([{ anon_function: false, anon_table: false, auth_function: false, auth_table: false }]);
  } finally { await db.close(); }
}, 30_000);
