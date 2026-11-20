import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let categoryId: string;
let accountId: string;
let expenseCategoryId: string;
let staffId: string;
const ownerId = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20", demo: true });
  await db.exec(`insert into auth.users(id) values ('${ownerId}');
    insert into private.app_owner(user_id) values ('${ownerId}');
    set role authenticated;
    set request.jwt.claim.sub = '${ownerId}';`);
  categoryId = (await db.query<{ id: string }>(
    "select id from inventory_categories where name='Animal feed & fodder'",
  )).rows[0].id;
  accountId = (await db.query<{ id: string }>(
    "select id from accounts where is_farm_cash and active limit 1",
  )).rows[0].id;
  expenseCategoryId = (await db.query<{ id: string }>(
    "select id from expense_categories where active and is_farm_cost and not is_salary order by sort_order limit 1",
  )).rows[0].id;
  staffId = (await db.query<{ id: string }>(
    "insert into staff(name,role) values ('Report QA worker','Worker') returning id",
  )).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

async function createItem(name: string, unit: string, opening: number, openingDate: string) {
  return (await db.query<{ id: string }>(
    "select create_inventory_item_once($1,$2,$3,$4,'consumable',0,$5,$4,$6) as id",
    [randomUUID(), name, categoryId, unit, opening, openingDate],
  )).rows[0].id;
}

async function recordPurchase(itemId: string, date: string, quantity: number, unit: string, total: number) {
  return db.query(
    `select record_inventory_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,'Report supplier','REP-1','Report QA',null,null)`,
    [randomUUID(), itemId, quantity, unit, total / quantity, total, date, accountId, expenseCategoryId],
  );
}

async function recordUsage(itemId: string, date: string, quantity: number, staff: string | null) {
  return db.query(
    "select record_inventory_usage($1,$2,$3,'kg',$4,'Animal feed',$5,'Report QA')",
    [randomUUID(), itemId, quantity, date, staff],
  );
}

describe("inventory report ledger views", () => {
  it("reconciles inclusive range balances while keeping opening entries, adjustments, and wastage distinct", async () => {
    const itemId = await createItem("Inventory report feed", "kg", 20, "2026-11-01");
    await recordPurchase(itemId, "2026-11-10", 5, "kg", 250);
    await recordUsage(itemId, "2026-11-11", 3, staffId);
    await recordUsage(itemId, "2026-11-12", 1, null);
    await db.query(
      "select record_inventory_adjustment($1,$2,2,'kg',1::smallint,'2026-11-12','adjustment','Physical count increase',null)",
      [randomUUID(), itemId],
    );
    await db.query(
      "select record_inventory_adjustment($1,$2,1,'kg',-1::smallint,'2026-11-13','adjustment','Physical count correction',null)",
      [randomUUID(), itemId],
    );
    await db.query(
      "select record_inventory_adjustment($1,$2,1,'kg',-1::smallint,'2026-11-14','wastage','Damaged feed',null)",
      [randomUUID(), itemId],
    );
    const samePeriodOpening = await createItem("Inventory report new opening", "kg", 4, "2026-11-12");
    const litresItem = await createItem("Inventory report litres", "litre", 2, "2026-11-01");

    const rows = (await db.query<Record<string, string | boolean>>(
      "select * from inventory_report_summary('2026-11-10','2026-11-14') order by item_name",
    )).rows;
    expect(rows).toHaveLength(3);
    const feed = rows.find((row) => row.item_id === itemId)!;
    expect({
      unit: feed.stock_unit,
      opening: Number(feed.opening_stock),
      openingEntries: Number(feed.opening_entries_in),
      purchase: Number(feed.purchases_in),
      usage: Number(feed.usage_out),
      adjustmentIn: Number(feed.adjustment_in),
      adjustmentOut: Number(feed.adjustment_out),
      wastage: Number(feed.wastage_out),
      closing: Number(feed.closing_stock),
      amount: Number(feed.purchase_amount),
      current: Number(feed.current_stock),
    }).toEqual({ unit: "kg", opening: 20, openingEntries: 0, purchase: 5, usage: 4,
      adjustmentIn: 2, adjustmentOut: 1, wastage: 1, closing: 21, amount: 250, current: 21 });
    expect(Number(rows.find((row) => row.item_id === samePeriodOpening)!.opening_entries_in)).toBe(4);
    expect(rows.find((row) => row.item_id === litresItem)!.stock_unit).toBe("litre");
    expect(Number(rows.find((row) => row.item_id === litresItem)!.opening_stock)).toBe(2);

    const oneDay = (await db.query<{ purchases_in: string; closing_stock: string }>(
      "select purchases_in,closing_stock from inventory_report_summary('2026-11-10','2026-11-10') where item_id=$1",
      [itemId],
    )).rows[0];
    expect([Number(oneDay.purchases_in), Number(oneDay.closing_stock)]).toEqual([5, 25]);
    await expect(db.query("select * from inventory_report_summary('2026-11-15','2026-11-14')"))
      .rejects.toThrow("INVENTORY_REPORT_PERIOD_INVALID");
    await expect(db.query("select * from inventory_report_summary('2026-11-20','2026-11-21')"))
      .rejects.toThrow("INVENTORY_REPORT_PERIOD_INVALID");
  });

  it("filters employee and general usage and pages chronological details with ledger balances", async () => {
    const itemId = await createItem("Inventory transaction report feed", "kg", 20, "2026-11-01");
    await recordPurchase(itemId, "2026-11-10", 5, "kg", 250);
    await recordUsage(itemId, "2026-11-11", 3, staffId);
    await recordUsage(itemId, "2026-11-12", 1, null);
    await db.query(
      "select record_inventory_adjustment($1,$2,2,'kg',1::smallint,'2026-11-13','adjustment','Counted stock',null)",
      [randomUUID(), itemId],
    );
    await db.query(
      "select record_inventory_adjustment($1,$2,1,'kg',-1::smallint,'2026-11-14','wastage','Damaged bag',null)",
      [randomUUID(), itemId],
    );

    const page1 = (await db.query<Record<string, string | number>>(
      "select * from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,null,false,null,2,0)", [itemId],
    )).rows;
    const page2 = (await db.query<Record<string, string | number>>(
      "select * from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,null,false,null,2,2)", [itemId],
    )).rows;
    expect(page1).toHaveLength(2);
    expect(Number(page1[0].matched_count)).toBe(5);
    expect(page1.map((row) => [row.movement_type, Number(row.running_balance_after)])).toEqual([
      ["purchase", 25], ["usage", 22],
    ]);
    expect(page2.map((row) => row.movement_type)).toEqual(["usage", "adjustment"]);
    const allPages = (await db.query<Record<string, string>>(
      "select * from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,null,false,null,50,0)", [itemId],
    )).rows;
    expect(allPages.map((row) => row.movement_type)).toEqual(["purchase", "usage", "usage", "adjustment", "wastage"]);

    const employeeRows = (await db.query<{ staff_id: string | null; total_quantity: string; transaction_count: string }>(
      "select * from inventory_report_usage_by_staff('2026-11-10','2026-11-14',$1) order by staff_id nulls last", [itemId],
    )).rows;
    expect(employeeRows.map((row) => [row.staff_id, Number(row.total_quantity), Number(row.transaction_count)])).toEqual([
      [staffId, 3, 1], [null, 1, 1],
    ]);
    const assigned = (await db.query<{ movement_type: string; staff_id: string }>(
      "select movement_type,staff_id from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,$2,false,null,50,0)",
      [itemId, staffId],
    )).rows;
    expect(assigned).toEqual([{ movement_type: "usage", staff_id: staffId }]);
    const unassigned = (await db.query<{ movement_type: string; staff_id: string | null }>(
      "select movement_type,staff_id from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,null,true,null,50,0)", [itemId],
    )).rows;
    expect(unassigned).toEqual([{ movement_type: "usage", staff_id: null }]);
    const search = (await db.query<{ movement_type: string; reason: string }>(
      "select movement_type,reason from inventory_report_transactions('2026-11-10','2026-11-14',$1,null,null,false,'damaged',50,0)", [itemId],
    )).rows;
    expect(search).toEqual([{ movement_type: "wastage", reason: "Damaged bag" }]);
    await expect(db.query(
      "select * from inventory_report_transactions('2026-11-10','2026-11-14',null,null,null,false,null,0,0)",
    )).rejects.toThrow("INVENTORY_REPORT_PAGE_INVALID");
  });

  it("enforces owner/demo report access and never creates inventory movements", async () => {
    await db.exec("reset role; insert into auth.users(id) values ('22222222-2222-4222-8222-222222222222'); set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';");
    await expect(db.query("select * from inventory_report_summary('2026-11-01','2026-11-20')"))
      .resolves.toBeDefined();
    expect((await db.query<{ count: number }>("select count(*)::int as count from inventory_report_summary('2026-11-01','2026-11-20')")).rows[0].count).toBe(0);
    await db.exec(`reset role; set request.jwt.claim.sub='${ownerId}'; set role authenticated;`);
    const before = (await db.query<{ count: number }>("select count(*)::int as count from inventory_movements")).rows[0].count;
    await db.query("select * from inventory_report_summary('2026-11-01','2026-11-20')");
    await db.query("select * from inventory_report_usage_by_staff('2026-11-01','2026-11-20')");
    await db.query("select * from inventory_report_transactions('2026-11-01','2026-11-20',null,null,null,false,null,50,0)");
    expect((await db.query<{ count: number }>("select count(*)::int as count from inventory_movements")).rows[0].count).toBe(before);

    const demo = await freshFarmDb({ farmDay: "2026-11-20", demo: true, demoAccess: true });
    try {
      await demo.exec("set role anon");
      await expect(demo.query("select * from inventory_report_summary('2026-11-01','2026-11-20')")).resolves.toBeDefined();
      await expect(demo.query("select * from inventory_report_usage_by_staff('2026-11-01','2026-11-20')")).resolves.toBeDefined();
    } finally { await demo.close(); }
  });
});
