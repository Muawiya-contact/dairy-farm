import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { freshFarmDb } from "./db-fixture";
import type { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let categoryId: string;
let feedItemId: string;
let replacementItemId: string;
let animalId: string;
let expenseCountBefore = 0;
const owner = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20", demo: true });
  await db.exec(`insert into auth.users(id) values ('${owner}');
    insert into private.app_owner(user_id) values ('${owner}');
    set role authenticated;
    set request.jwt.claim.sub = '${owner}';`);
  categoryId = (await db.query<{ id: string }>(
    "select id from inventory_categories where name = 'Animal feed & fodder'",
  )).rows[0].id;
  feedItemId = await createItem("Per-animal feed QA", 10);
  replacementItemId = await createItem("Per-animal correction QA", 10);
  animalId = (await db.query<{ id: string }>(
    `insert into animals(tag,name,species,sex,category,source,arrival_date)
     values ('FEED-QA','Feed QA','cow','female','cow','purchased','2026-01-01') returning id`,
  )).rows[0].id;
  expenseCountBefore = (await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count;
}, 30_000);

afterAll(async () => { await db?.close(); });

async function createItem(name: string, opening: number) {
  return (await db.query<{ id: string }>(
    `select create_inventory_item_once($1,$2,$3,'kg','consumable',0,$4,'kg','2026-11-20') as id`,
    [randomUUID(), name, categoryId, opening],
  )).rows[0].id;
}

async function recordFeed(requestId: string, itemId: string, quantity: number, unit = "kg", date = "2026-11-20") {
  return (await db.query<{ id: string }>(
    "select record_animal_feed_once($1,$2,$3,$4,$5,$6,null) as id",
    [requestId, animalId, itemId, quantity, unit, date],
  )).rows[0].id;
}

describe("per-animal feed records", () => {
  it("issues stock exactly once and records multiple dated feed items without a second expense", async () => {
    const firstRequest = randomUUID();
    const first = await recordFeed(firstRequest, feedItemId, 2);
    expect(await recordFeed(firstRequest, feedItemId, 2)).toBe(first);
    await recordFeed(randomUUID(), feedItemId, 500, "g");
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [feedItemId],
    )).rows[0].current_stock)).toBe(7.5);
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from animal_feed_entries where animal_id=$1", [animalId],
    )).rows[0].count).toBe(2);
    expect((await db.query<{ expense_id: string | null; unit_rate: string | null; total_amount: string | null }>(
      "select expense_id,unit_rate,total_amount from inventory_movements where id=(select stock_movement_id from animal_feed_entries where id=$1)", [first],
    )).rows[0]).toEqual({ expense_id: null, unit_rate: null, total_amount: null });
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(expenseCountBefore);
    await expect(recordFeed(firstRequest, feedItemId, 3)).rejects.toThrow(/ANIMAL_FEED_REQUEST_CHANGED/);
  });

  it("rejects invalid units, insufficient stock, future and out-of-stay dates atomically", async () => {
    const before = (await db.query<{ count: number }>("select count(*)::int as count from inventory_movements")).rows[0].count;
    await expect(recordFeed(randomUUID(), feedItemId, 1, "litre")).rejects.toThrow(/INVENTORY_UNIT_MISMATCH/);
    await expect(recordFeed(randomUUID(), feedItemId, 100, "kg")).rejects.toThrow(/INVENTORY_INSUFFICIENT_STOCK/);
    await expect(recordFeed(randomUUID(), feedItemId, 1, "kg", "2026-11-21")).rejects.toThrow(/ANIMAL_FEED_INVALID/);
    await expect(recordFeed(randomUUID(), feedItemId, 1, "kg", "2025-12-31")).rejects.toThrow(/ANIMAL_FEED_OUTSIDE_STAY/);
    expect((await db.query<{ count: number }>("select count(*)::int as count from inventory_movements")).rows[0].count).toBe(before);
  });

  it("keeps corrections auditable and reconciles inventory through dated adjustment and replacement usage", async () => {
    const originalId = (await db.query<{ id: string }>(
      "select id from animal_feed_entries where inventory_item_id=$1 and quantity=2 and supersedes_id is null", [feedItemId],
    )).rows[0].id;
    const correctionRequest = randomUUID();
    const replacementId = (await db.query<{ id: string }>(
      "select correct_animal_feed_once($1,$2,$3,1,'kg','Corrected amount') as id",
      [correctionRequest, originalId, replacementItemId],
    )).rows[0].id;
    expect((await db.query<{ id: string }>(
      "select correct_animal_feed_once($1,$2,$3,1,'kg','Corrected amount') as id",
      [correctionRequest, originalId, replacementItemId],
    )).rows[0].id).toBe(replacementId);
    const replacement = (await db.query<{ feed_date: string; inventory_item_id: string; supersedes_id: string }>(
      "select feed_date,inventory_item_id,supersedes_id from animal_feed_entries where id=$1", [replacementId],
    )).rows[0];
    expect(replacement).toEqual({ feed_date: new Date("2026-11-20T00:00:00.000Z"), inventory_item_id: replacementItemId, supersedes_id: originalId });
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [feedItemId],
    )).rows[0].current_stock)).toBe(9.5);
    expect(Number((await db.query<{ current_stock: string }>(
      "select current_stock from inventory_stock_on('2026-11-20') where item_id=$1", [replacementItemId],
    )).rows[0].current_stock)).toBe(9);
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from animal_feed_entries old where old.animal_id=$1 and not exists (select 1 from animal_feed_entries newer where newer.supersedes_id=old.id)", [animalId],
    )).rows[0].count).toBe(2);
    expect((await db.query<{ movement_type: string; quantity_delta: string }>(
      "select movement_type,quantity_delta from inventory_movements where purpose like 'Corrected animal feed%' or reason='Animal feed correction' order by movement_seq",
    )).rows.map((row) => [row.movement_type, Number(row.quantity_delta)])).toEqual([["adjustment", 2], ["usage", -1]]);
    expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(expenseCountBefore);
    await db.exec("reset role");
    await expect(db.query("update animal_feed_entries set quantity=3 where id=$1", [replacementId]))
      .rejects.toThrow(/ANIMAL_FEED_IMMUTABLE/);
    await expect(db.query("delete from animal_feed_entries where id=$1", [replacementId]))
      .rejects.toThrow(/ANIMAL_FEED_IMMUTABLE/);
  });
});
