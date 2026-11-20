import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { freshFarmDb } from "./db-fixture";
import type { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let farmCash: string;
let farmExpenseCategory: string;
let inventoryCategory: string;
let staffId: string;
const owner = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20", demo: true });
  await db.exec(`insert into auth.users(id) values ('${owner}');
    insert into private.app_owner(user_id) values ('${owner}');
    set role authenticated;
    set request.jwt.claim.sub = '${owner}';`);
  farmCash = (await db.query<{ id: string }>("select id from accounts where is_farm_cash and active limit 1")).rows[0].id;
  farmExpenseCategory = (await db.query<{ id: string }>(
    "select id from expense_categories where active and is_farm_cost and not is_salary order by sort_order limit 1",
  )).rows[0].id;
  inventoryCategory = (await db.query<{ id: string }>(
    "select id from inventory_categories where name = 'Animal feed & fodder'",
  )).rows[0].id;
  staffId = (await db.query<{ id: string }>(
    "insert into staff(name,role) values ('Inventory QA worker','Worker') returning id",
  )).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

async function createItem(options: { name?: string; unit?: string; opening?: number; date?: string; minimum?: number } = {}) {
  const requestId = randomUUID();
  const row = (await db.query<{ id: string }>(
    `select create_inventory_item_once($1,$2,$3,$4,'consumable',$5,$6,$4,$7) as id`,
    [requestId, options.name ?? `Inventory ${requestId.slice(0, 8)}`, inventoryCategory,
      options.unit ?? "kg", options.minimum ?? 0, options.opening ?? 0, options.date ?? "2026-11-20"],
  )).rows[0];
  return row.id;
}

async function recordPurchase(input: {
  requestId: string; itemId: string; quantity: number; unit: string; rate: number; total: number;
  date?: string; accountId?: string; batch?: string | null; expiry?: string | null;
}) {
  return (await db.query<{ id: string }>(
    `select record_inventory_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,'QA supplier','INV-1','Inventory QA',$10,$11) as id`,
    [input.requestId, input.itemId, input.quantity, input.unit, input.rate, input.total,
      input.date ?? "2026-11-20", input.accountId ?? farmCash, farmExpenseCategory,
      input.batch ?? null, input.expiry ?? null],
  )).rows[0].id;
}

async function recordUsage(input: {
  requestId: string; itemId: string; quantity: number; unit: string; date?: string; staff?: string | null;
}) {
  return (await db.query<{ id: string }>(
    "select record_inventory_usage($1,$2,$3,$4,$5,'Animal feed',$6,'Inventory QA use') as id",
    [input.requestId, input.itemId, input.quantity, input.unit, input.date ?? "2026-11-20", input.staff ?? null],
  )).rows[0].id;
}

describe("farm inventory ledger", () => {
  it("posts a purchase once to stock, Kharcha, and Galla, then records usage without money effects", async () => {
    const itemId = await createItem({ name: "Inventory feed reconciliation", unit: "kg", minimum: 50 });
    const beforeCash = Number((await db.query<{ balance: string }>(
      "select account_balance_on($1,'2026-11-20') as balance", [farmCash],
    )).rows[0].balance);
    const requestId = randomUUID();
    const purchaseId = await recordPurchase({ requestId, itemId, quantity: 500, unit: "kg", rate: 100, total: 50000 });
    expect(await recordPurchase({ requestId, itemId, quantity: 500, unit: "kg", rate: 100, total: 50000 })).toBe(purchaseId);
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from inventory_movements where request_id = $1", [requestId],
    )).rows[0].count).toBe(1);

    const movement = (await db.query<{ expense_id: string; account_id: string; quantity_delta: string; total_amount: string }>(
      "select expense_id,account_id,quantity_delta,total_amount from inventory_movements where id=$1", [purchaseId],
    )).rows[0];
    expect(movement.expense_id).toBeTruthy();
    expect(movement.account_id).toBe(farmCash);
    expect(Number(movement.quantity_delta)).toBe(500);
    expect(Number(movement.total_amount)).toBe(50000);
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from expenses where id=$1 and amount=50000", [movement.expense_id],
    )).rows[0].count).toBe(1);
    expect(Number((await db.query<{ balance: string }>(
      "select account_balance_on($1,'2026-11-20') as balance", [farmCash],
    )).rows[0].balance)).toBeCloseTo(beforeCash - 50000, 2);
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(500);

    const usageRequest = randomUUID();
    const usageId = await recordUsage({ requestId: usageRequest, itemId, quantity: 50, unit: "kg", staff: staffId });
    expect(await recordUsage({ requestId: usageRequest, itemId, quantity: 50, unit: "kg", staff: staffId })).toBe(usageId);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses where id=$1", [movement.expense_id])).rows[0].count).toBe(1);
    expect(Number((await db.query<{ balance: string }>(
      "select account_balance_on($1,'2026-11-20') as balance", [farmCash],
    )).rows[0].balance)).toBeCloseTo(beforeCash - 50000, 2);
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(450);
    expect((await db.query<{ movement_type: string; running_balance_after: string; staff_id: string | null }>(
      "select movement_type,running_balance_after,staff_id from inventory_item_history($1,'2026-11-20','2026-11-20') order by movement_seq", [itemId],
    )).rows.map((row) => [row.movement_type, Number(row.running_balance_after), row.staff_id])).toEqual([
      ["purchase", 500, null], ["usage", 450, staffId],
    ]);
    await expect(recordPurchase({ requestId, itemId, quantity: 400, unit: "kg", rate: 100, total: 40000 }))
      .rejects.toThrow(/INVENTORY_REQUEST_CHANGED/);
  });

  it("converts compatible mass units and rejects incompatible stock units without side effects", async () => {
    const itemId = await createItem({ name: "Inventory conversion test", unit: "kg" });
    const requestId = randomUUID();
    await recordPurchase({ requestId, itemId, quantity: 1000, unit: "g", rate: 0.1, total: 100 });
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(1);
    await recordUsage({ requestId: randomUUID(), itemId, quantity: 250, unit: "g" });
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(0.75);

    const expenseCount = (await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count;
    await expect(recordPurchase({ requestId: randomUUID(), itemId, quantity: 1, unit: "litre", rate: 100, total: 100 }))
      .rejects.toThrow(/INVENTORY_UNIT_MISMATCH/);
    await expect(recordUsage({ requestId: randomUUID(), itemId, quantity: 2, unit: "kg" }))
      .rejects.toThrow(/INVENTORY_INSUFFICIENT_STOCK/);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(expenseCount);
  });

  it("shows configurable low and zero-stock states and keeps purchase batch and expiry details", async () => {
    const itemId = await createItem({ name: "Inventory batch and threshold test", unit: "kg", minimum: 20 });
    const requestId = randomUUID();
    await recordPurchase({ requestId, itemId, quantity: 5, unit: "kg", rate: 100, total: 500,
      batch: "WANDA-LOT-42", expiry: "2026-12-20" });
    const low = (await db.query<{ current_stock: string; low_stock: boolean; out_of_stock: boolean }>(
      "select current_stock,low_stock,out_of_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0];
    expect([Number(low.current_stock), low.low_stock, low.out_of_stock]).toEqual([5, true, false]);
    const purchase = (await db.query<{ batch_code: string | null; expiry_date: Date | string | null; total_amount: string }>(
      "select batch_code,expiry_date,total_amount from inventory_item_history($1,'2026-11-20','2026-11-20')", [itemId],
    )).rows[0];
    expect(purchase.batch_code).toBe("WANDA-LOT-42");
    expect(new Date(purchase.expiry_date!).toISOString().slice(0, 10)).toBe("2026-12-20");
    expect(Number(purchase.total_amount)).toBe(500);

    await recordUsage({ requestId: randomUUID(), itemId, quantity: 5, unit: "kg" });
    const empty = (await db.query<{ current_stock: string; low_stock: boolean; out_of_stock: boolean }>(
      "select current_stock,low_stock,out_of_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0];
    expect([Number(empty.current_stock), empty.low_stock, empty.out_of_stock]).toEqual([0, false, true]);

    const expenseCount = (await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count;
    await expect(recordPurchase({ requestId: randomUUID(), itemId, quantity: 1, unit: "kg", rate: 100, total: 100,
      expiry: "2026-11-19" })).rejects.toThrow(/INVENTORY_PURCHASE_INVALID/);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(expenseCount);
  });

  it("keeps date-filtered history chronological when an unlocked backdated issue is added", async () => {
    const itemId = await createItem({ name: "Inventory history test", unit: "kg", opening: 200, date: "2026-11-01" });
    await recordUsage({ requestId: randomUUID(), itemId, quantity: 30, unit: "kg", date: "2026-11-05", staff: staffId });
    await recordUsage({ requestId: randomUUID(), itemId, quantity: 10, unit: "kg", date: "2026-11-03" });
    const history = (await db.query<{ movement_type: string; movement_date: string; running_balance_after: string }>(
      "select movement_type,movement_date,running_balance_after from inventory_item_history($1,'2026-11-03','2026-11-05')", [itemId],
    )).rows;
    expect(history.map((row) => [row.movement_type, new Date(row.movement_date).toISOString().slice(0, 10), Number(row.running_balance_after)])).toEqual([
      ["usage", "2026-11-03", 190], ["usage", "2026-11-05", 160],
    ]);
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-02') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(200);
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(160);
    expect((await db.query("select * from inventory_item_history($1,'2026-11-04','2026-11-04')", [itemId])).rows).toHaveLength(0);
  });

  it("requires audited adjustment reasons and prevents negative stock", async () => {
    const itemId = await createItem({ name: "Inventory adjustment test", unit: "kg", opening: 10 });
    const request = randomUUID();
    await db.query(
      "select record_inventory_adjustment($1,$2,2,'kg',-1::smallint,'2026-11-20','adjustment','Physical count correction','Counted by owner')",
      [request, itemId],
    );
    await db.query(
      "select record_inventory_adjustment($1,$2,1,'kg',-1::smallint,'2026-11-20','wastage','Damaged feed',null)",
      [randomUUID(), itemId],
    );
    await db.query(
      "select record_inventory_adjustment($1,$2,2,'kg',1::smallint,'2026-11-20','adjustment','Found unopened feed',null)",
      [randomUUID(), itemId],
    );
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [itemId],
    )).rows[0].current_stock)).toBe(9);
    expect((await db.query<{ recorded_stock_before: string; recorded_stock_after: string; actor_id: string | null }>(
      "select recorded_stock_before,recorded_stock_after,actor_id from inventory_item_history($1,'2026-11-20','2026-11-20') where reason='Physical count correction'", [itemId],
    )).rows.map((row) => [Number(row.recorded_stock_before), Number(row.recorded_stock_after), row.actor_id])).toEqual([[10, 8, owner]]);
    await expect(db.query(
      "select record_inventory_adjustment($1,$2,1,'kg',-1::smallint,'2026-11-20','adjustment',' ',null)", [randomUUID(), itemId],
    )).rejects.toThrow(/INVENTORY_ADJUSTMENT_INVALID/);
    await expect(db.query(
      "select record_inventory_adjustment($1,$2,10,'kg',-1::smallint,'2026-11-20','wastage','Too much wastage',null)", [randomUUID(), itemId],
    )).rejects.toThrow(/INVENTORY_INSUFFICIENT_STOCK/);
  });

  it("rolls back both sides of a purchase on a month lock and blocks direct movement edits", async () => {
    const itemId = await createItem({ name: "Inventory locked purchase test", unit: "kg" });
    const earlyAccount = (await db.query<{ id: string }>(
      "insert into accounts(name,kind,opening_date,opening_balance) values ('Inventory QA bank','bank','2026-09-01',100000) returning id",
    )).rows[0].id;
    await db.query("select close_farm_month('2026-10-01','Inventory month-lock test')");
    const expenseCount = (await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count;
    await expect(recordPurchase({ requestId: randomUUID(), itemId, quantity: 1, unit: "kg", rate: 100, total: 100,
      date: "2026-10-15", accountId: earlyAccount })).rejects.toThrow(/MONTH_LOCKED/);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(expenseCount);
    expect((await db.query<{ count: number }>("select count(*)::int as count from inventory_movements where item_id=$1", [itemId])).rows[0].count).toBe(0);

    const seededItem = await createItem({ name: "Inventory immutable movement test", unit: "kg", opening: 1 });
    const openingId = (await db.query<{ id: string }>("select id from inventory_movements where item_id=$1", [seededItem])).rows[0].id;
    await expect(db.query("update inventory_movements set note='rewritten' where id=$1", [openingId]))
      .rejects.toThrow(/permission denied/i);
  });

  it("keeps inventory owner-only outside the staging demo role", async () => {
    const stranger = "22222222-2222-4222-8222-222222222222";
    await db.exec(`reset role; insert into auth.users(id) values ('${stranger}');
      set role authenticated; set request.jwt.claim.sub='${stranger}';`);
    expect((await db.query<{ count: number }>("select count(*)::int as count from inventory_items")).rows[0].count).toBe(0);
    await expect(db.query(
      "select record_inventory_usage($1,$2,1,'kg','2026-11-20','Animal feed',null,null)", [randomUUID(), "00000000-0000-4000-8000-000000000001"],
    )).rejects.toThrow(/INVENTORY_NOT_ALLOWED/);
    await expect(db.query("insert into inventory_categories(name) values ('Unauthorized')"))
      .rejects.toThrow(/permission denied/i);
    await db.exec(`reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`);

    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from inventory_categories")).rejects.toThrow(/permission denied/i);
    await db.exec(`reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`);
  });

  it("grants the enabled demo role access only through the staging inventory RPCs", async () => {
    const demo = await freshFarmDb({ farmDay: "2026-11-20", demo: true, demoAccess: true });
    try {
      await demo.exec("set role anon;");
      expect((await demo.query("select id from inventory_categories")).rows.length).toBeGreaterThan(0);
      const categoryId = (await demo.query<{ id: string }>(
        "select id from inventory_categories where name='Animal feed & fodder'",
      )).rows[0].id;
      const itemId = (await demo.query<{ id: string }>(
        `select create_inventory_item_once($1,'Demo inventory item',$2,'kg','consumable',0,2,'kg','2026-11-20') as id`,
        [randomUUID(), categoryId],
      )).rows[0].id;
      expect((await demo.query("select id from inventory_items where id=$1", [itemId])).rows).toHaveLength(1);
      expect((await demo.query("select id from inventory_movements where item_id=$1", [itemId])).rows).toHaveLength(1);
    } finally { await demo.close(); }
  });
});
