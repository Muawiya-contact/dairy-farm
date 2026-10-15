import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let animal: string;
let account: string;
let category: string;
beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  animal = (await db.query<{ id: string }>("insert into animals(tag, arrival_date) values ('HEALTH-1', '2026-09-01') returning id")).rows[0].id;
  account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  category = (await db.query<{ id: string }>("select id from expense_categories where name = 'Dawai / vet'")).rows[0].id;
  await db.query("update accounts set opening_date = '2026-09-01' where id = $1", [account]);
}, 30_000);
afterAll(async () => { await db?.close(); });

test("paid health event creates one linked expense in the selected account", async () => {
  const result = await db.query<{ id: string }>(
    "select record_health_event($1, '2026-10-20', 'treatment', 'Vet visit', 250.50, null, $2, $3) as id",
    [animal, category, account],
  );
  const rows = (await db.query<{ event_id: string; expense_id: string; account_id: string; amount: string }>(`
    select h.id as event_id, e.id as expense_id, e.account_id, e.amount
    from health_events h join expenses e on e.id = h.expense_id
  `)).rows;
  expect(rows).toEqual([{ event_id: result.rows[0].id, expense_id: expect.any(String), account_id: account, amount: "250.50" }]);
  expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(1);
});

test("paid health event is rejected in a closed month with no partial rows", async () => {
  await db.exec("insert into month_locks(month) values ('2026-09-01')");
  await expect(db.query(
    "select record_health_event($1, '2026-09-10', 'treatment', 'Too late', 100, null, $2, $3)",
    [animal, category, account],
  )).rejects.toThrow(/MONTH_LOCKED/);
  expect((await db.query<{ count: number }>("select count(*)::int as count from health_events where title = 'Too late'")).rows[0].count).toBe(0);
  expect((await db.query<{ count: number }>("select count(*)::int as count from expenses where note = 'Too late'")).rows[0].count).toBe(0);
});
