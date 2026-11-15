import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true });
  await db.exec(`
    insert into customers(name, kind, opening_date) values ('Buyer', 'regular', '2026-10-01');
    insert into customer_rates(customer_id, rate, effective_from) select id, 150, '2026-10-01' from customers;
    select public.save_milk_entry_checked('2026-10-20', 'morning', 10, 'total', '[]',
      jsonb_build_array(jsonb_build_object('customer_id', (select id from customers), 'litres', 4)), null, '');
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

test("milk correction snapshots the old and new entry without double-posting a delivery", async () => {
  await db.query<{ correct_milk_entry_checked: string }>(`select public.correct_milk_entry_checked('2026-10-20', 'morning', 9, 'total', '[]',
    jsonb_build_array(jsonb_build_object('customer_id', (select id from customers), 'litres', 4)),
    (select updated_at from milk_shifts where milk_date = '2026-10-20' and shift = 'morning'), '', '10 L se 9 L durust')`);
  expect((await db.query("select total_litres::text from milk_shifts where milk_date = '2026-10-20'")).rows).toEqual([{ total_litres: "9.00" }]);
  expect((await db.query("select count(*)::int as count from milk_deliveries where delivery_date = '2026-10-20'")).rows).toEqual([{ count: 1 }]);
  const audit = (await db.query<{ reason: string; before_total: string; after_total: string }>(`
    select reason, before_row->'shift'->>'total_litres' as before_total, after_row->'shift'->>'total_litres' as after_total
    from private.milk_entry_audit`)).rows[0];
  expect(audit).toEqual({ reason: "10 L se 9 L durust", before_total: "10.00", after_total: "9.00" });
});

test("a correction cannot exceed corrected production or omit its reason", async () => {
  await expect(db.query(`select public.correct_milk_entry_checked('2026-10-20', 'morning', 3, 'total', '[]',
    jsonb_build_array(jsonb_build_object('customer_id', (select id from customers), 'litres', 4)),
    (select updated_at from milk_shifts where milk_date = '2026-10-20' and shift = 'morning'), '', 'too low')`))
    .rejects.toThrow(/diya gaya doodh kul miktar se zyada/i);
  await expect(db.query(`select public.correct_milk_entry_checked('2026-10-20', 'morning', 9, 'total', '[]',
    '[]', (select updated_at from milk_shifts where milk_date = '2026-10-20' and shift = 'morning'), '', '')`)).rejects.toThrow("MILK_CORRECTION_REASON");
});
