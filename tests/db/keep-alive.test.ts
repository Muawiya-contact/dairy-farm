import { expect, test } from "vitest";
import { freshFarmDb } from "./db-fixture";

test("anon keep_alive updates one private timestamp without farm data access", async () => {
  const db = await freshFarmDb();
  try {
    await db.exec("set role anon");
    const first = await db.query<{ keep_alive: Date }>("select public.keep_alive()");
    const second = await db.query<{ keep_alive: Date }>("select public.keep_alive()");
    expect(Number.isNaN(first.rows[0].keep_alive.getTime())).toBe(false);
    expect(Number.isNaN(second.rows[0].keep_alive.getTime())).toBe(false);
    await expect(db.query("select * from private.heartbeat")).rejects.toThrow();
    await expect(db.query("select * from public.settings")).rejects.toThrow();
    await expect(db.query("select * from public.animals")).rejects.toThrow();
    await db.exec("set role authenticated");
    await expect(db.query("select public.keep_alive()")).rejects.toThrow();

    await db.exec("reset role");
    const { rows } = await db.query<{ id: number; last_ping: Date }>(
      "select id, last_ping from private.heartbeat",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
    expect(rows[0].last_ping).toEqual(second.rows[0].keep_alive);
  } finally {
    await db.close();
  }
}, 30_000);
