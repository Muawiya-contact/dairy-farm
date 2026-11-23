import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => { db = await freshFarmDb({ farmDay: "2026-11-23", demoAccess: true }); }, 30_000);
afterAll(async () => { await db?.close(); });

it("uses chiller carry-forward before current production runs out, without treating stock as a sale", async () => {
  await db.exec("begin");
  try {
    const buyer = (await db.query<{ id: string }>(`
      insert into public.customers(name,kind,opening_date) values ('Chiller buyer','regular','2026-01-01') returning id
    `)).rows[0].id;
    const secondBuyer = (await db.query<{ id: string }>(`
      insert into public.customers(name,kind,opening_date) values ('Second chiller buyer','regular','2026-01-01') returning id
    `)).rows[0].id;
    await db.query("insert into public.customer_rates(customer_id,rate,effective_from) values ($1,150,'2026-01-01'),($2,150,'2026-01-01')", [buyer, secondBuyer]);
    const save = `select public.save_milk_entry_with_dispositions(
      $1::date,$2::text,$3::numeric,'total','[]'::jsonb,$4::jsonb,'[]'::jsonb,null,'')`;
    const deliveries = (litres: number) => JSON.stringify([{ customer_id: buyer, litres }]);

    // 5,000 L production minus 781 L delivered leaves 4,219 L in the chiller.
    await db.query(save, ["2026-11-22", "morning", 5000, deliveries(781)]);
    // Today's customer delivery is 5 L above today's 500 L production, so it
    // must consume chiller stock and leave 4,214 L for the following shift.
    await db.query(save, ["2026-11-23", "morning", 500, deliveries(505)]);
    const eveningDeliveries = JSON.stringify([
      { customer_id: buyer, litres: 2107 }, { customer_id: secondBuyer, litres: 2107 },
    ]);
    await db.query(save, ["2026-11-23", "evening", 0, eveningDeliveries]);

    const day = (await db.query<Record<string, string>>(`
      select opening_litres::text, produced_litres::text, available_litres::text,
        allocated_litres::text, remaining_litres::text, khata_amount::text, cash_sale_amount::text
      from public.milk_day_distribution_summary('2026-11-23')
    `)).rows[0];
    expect(day).toMatchObject({ opening_litres: "4219.00", produced_litres: "500.00", available_litres: "4719.00",
      allocated_litres: "4719.00", remaining_litres: "0.00", khata_amount: "707850.00", cash_sale_amount: "0" });
    const priorDaySales = (await db.query<{ total_sales_amount: string }>(`
      select total_sales_amount::text from public.milk_report_distribution_daily('2026-11-22','2026-11-22')
    `)).rows[0].total_sales_amount;
    expect(priorDaySales).toBe("117150.00");

    const shifts = (await db.query<Record<string, string>>(`
      select milk_shift,opening_litres::text,produced_litres::text,available_litres::text,
        allocated_litres::text,remaining_litres::text
      from public.milk_shift_distribution_summary('2026-11-23')
      order by case milk_shift when 'morning' then 1 when 'noon' then 2 else 3 end
    `)).rows;
    expect(shifts).toEqual([
      { milk_shift: "morning", opening_litres: "4219.00", produced_litres: "500.00", available_litres: "4719.00", allocated_litres: "505.00", remaining_litres: "4214.00" },
      { milk_shift: "evening", opening_litres: "4214.00", produced_litres: "0.00", available_litres: "4214.00", allocated_litres: "4214.00", remaining_litres: "0.00" },
    ]);

    const reportShifts = (await db.query<Record<string, string>>(`
      select milk_shift,opening_litres::text,produced_litres::text,available_litres::text,
        allocated_litres::text,remaining_litres::text
      from public.milk_report_distribution_shifts('2026-11-23','2026-11-23')
      order by case milk_shift when 'morning' then 1 when 'noon' then 2 else 3 end
    `)).rows;
    expect(reportShifts).toEqual([
      { milk_shift: "morning", opening_litres: "4219.00", produced_litres: "500.00", available_litres: "4719.00", allocated_litres: "505.00", remaining_litres: "4214.00" },
      { milk_shift: "evening", opening_litres: "4214.00", produced_litres: "0.00", available_litres: "4214.00", allocated_litres: "4214.00", remaining_litres: "0.00" },
    ]);

    const dayReport = (await db.query<Record<string, string>>(`
      select opening_litres::text,available_litres::text,total_sales_amount::text,remaining_litres::text
      from public.milk_report_distribution_daily('2026-11-23','2026-11-23')
    `)).rows[0];
    expect(dayReport).toEqual({ opening_litres: "4219.00", available_litres: "4719.00", total_sales_amount: "707850.00", remaining_litres: "0.00" });

    await db.exec("set constraints all immediate");
    await expect(db.query(save, ["2026-11-23", "noon", 0, deliveries(0.01)])).rejects.toThrow("MILK_DISTRIBUTION_EXCEEDS_AVAILABLE");
  } finally { await db.exec("rollback"); }
});
