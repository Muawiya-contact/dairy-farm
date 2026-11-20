import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("migrates historical waste from a locked month without changing its balance", async () => {
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
    const directory = resolve("supabase/migrations");
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
      if (file === "20261119000005_milk_dispositions.sql") break;
      await db.exec(readFileSync(resolve(directory, file), "utf8"));
    }
    await db.exec(`
      insert into public.milk_shifts(milk_date, shift, total_litres) values ('2026-10-15', 'morning', 10);
      insert into public.milk_day_adjustments(milk_date, wasted_litres, waste_reason)
        values ('2026-10-15', 2, 'Old spill');
      insert into public.month_locks(month, note) values ('2026-10-01', 'Historical close');
    `);
    await db.exec(readFileSync(resolve(directory, "20261119000005_milk_dispositions.sql"), "utf8"));

    const { rows } = await db.query<Record<string, string>>(`
      select d.disposition_type, d.category, d.litres::text, d.note,
        r.closing_litres::text as closing_litres
      from public.milk_dispositions d
      join public.milk_report_daily('2026-10-15', '2026-10-15') r on r.report_date=d.milk_date
    `);
    expect(rows).toEqual([{ disposition_type: "wastage", category: "other", litres: "2.00", note: "Old spill", closing_litres: "8.00" }]);
    await expect(db.query("select save_milk_day_waste('2026-10-15', 1, 'New spill')")).rejects.toThrow("MONTH_LOCKED");
  } finally {
    await db.close();
  }
}, 30_000);
