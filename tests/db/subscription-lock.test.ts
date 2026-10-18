import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("permits reads but blocks direct and RPC writes after expiry; browser roles cannot renew", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const file of readdirSync(resolve("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    const unguarded = await db.query<{ relname: string }>(`select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid
          and t.tgname = 'subscription_write_guard' and not t.tgisinternal)
      order by c.relname`);
    expect(unguarded.rows).toEqual([]);
    const owner = "11111111-1111-4111-8111-111111111111";
    await db.exec(`insert into auth.users(id) values ('${owner}');
      insert into private.app_owner(user_id) values ('${owner}');
      insert into public.month_locks(month) values (date_trunc('month', public.farm_today() - interval '2 months')::date);
      update private.farm_subscription set expires_on = public.farm_today() - 1;
      set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    expect((await db.query<{ read_only: boolean }>("select read_only from subscription_status()")).rows[0].read_only).toBe(true);
    expect((await db.query("select count(*)::int as count from accounts")).rows).toEqual([{ count: 1 }]);
    await expect(db.exec("insert into animals(tag, arrival_date) values ('BLOCKED', farm_today())")).rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("update accounts set name = 'Changed' where is_farm_cash")).rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("delete from accounts where is_farm_cash")).rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("select create_customer('Test','regular','',0,0,150,0,farm_today(),null)")).rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("select close_farm_month(date_trunc('month', farm_today() - interval '1 month')::date, 'test')"))
      .rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("select reopen_farm_month(date_trunc('month', farm_today() - interval '2 months')::date, 'Annual lock test')"))
      .rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
    await expect(db.exec("update private.farm_subscription set expires_on = farm_today()+365")).rejects.toThrow();
    await db.exec("reset role; update private.farm_subscription set expires_on = public.farm_today()+7; set role authenticated");
    expect((await db.query<{ days_remaining: number; read_only: boolean }>("select days_remaining, read_only from subscription_status()")).rows)
      .toEqual([{ days_remaining: 7, read_only: false }]);
    await db.exec("insert into animals(tag, arrival_date) values ('ALLOWED', farm_today())");
    expect((await db.query<{ close_farm_month: boolean }>("select close_farm_month(date_trunc('month', farm_today() - interval '1 month')::date, 'test')")).rows)
      .toEqual([{ close_farm_month: true }]);
    expect((await db.query<{ reopen_farm_month: boolean }>("select reopen_farm_month(date_trunc('month', farm_today() - interval '2 months')::date, 'Annual lock test')")).rows)
      .toEqual([{ reopen_farm_month: true }]);
  } finally { await db.close(); }
}, 30_000);
