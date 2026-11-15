import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => { db = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true }); }, 30_000);
afterAll(async () => { await db?.close(); });

test("a local cash buyer is retry-safe and a charity customer stays free", async () => {
  const request = "00000000-0000-0000-0000-000000000441";
  const first = (await db.query<{ create_local_customer_once: string }>(
    `select create_local_customer_once('${request}', 'Walk in', 'cash', '', 200, '2026-10-20', null)`,
  )).rows[0].create_local_customer_once;
  const retry = (await db.query<{ create_local_customer_once: string }>(
    `select create_local_customer_once('${request}', 'Walk in', 'cash', '', 200, '2026-10-20', null)`,
  )).rows[0].create_local_customer_once;
  expect(retry).toBe(first);
  expect((await db.query("select kind, is_local, opening_balance::text from customers where id = $1", [first])).rows)
    .toEqual([{ kind: "cash", is_local: true, opening_balance: "0.00" }]);
  const reused = (await db.query<{ create_local_customer_once: string }>(
    `select create_local_customer_once('00000000-0000-0000-0000-000000000444', 'Walk in', 'cash', '', 225, '2026-10-20', null)`,
  )).rows[0].create_local_customer_once;
  expect(reused).toBe(first);
  expect((await db.query("select rate::text from customer_rates where customer_id = $1 and effective_from = '2026-10-20'", [first])).rows)
    .toEqual([{ rate: "225.00" }]);
  await db.exec("select create_local_customer_once('00000000-0000-0000-0000-000000000442', 'Khairat', 'free', '', 0, '2026-10-20', 'charity')");
  expect((await db.query("select kind, free_reason, is_local from customers where name = 'Khairat'")).rows)
    .toEqual([{ kind: "free", free_reason: "charity", is_local: true }]);
});

test("a local record cannot quietly reuse a standing customer's name", async () => {
  await db.exec("insert into customers(name, kind, opening_date) values ('Standing', 'regular', '2026-10-20')");
  await expect(db.query("select create_local_customer_once('00000000-0000-0000-0000-000000000443', 'Standing', 'cash', '', 200, '2026-10-20', null)"))
    .rejects.toThrow("CUSTOMER_NAME_EXISTS");
});
