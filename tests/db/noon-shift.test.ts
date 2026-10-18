import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  await db.exec(`insert into auth.users(id) values ('${owner}');
    insert into private.app_owner(singleton,user_id) values(true,'${owner}');`);
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
const asOwner = async () => { await db.exec(`set request.jwt.claim.sub = '${owner}'; set role authenticated;`); };
const save = (shift: string, version = "null", total = 0, deliveries = "[]") =>
  `select public.save_milk_entry_checked(public.farm_today(),'${shift}',${total},'total','[]'::jsonb,'${deliveries}'::jsonb,${version},'')`;
async function rejects(sql: string, reason: RegExp) {
  await db.exec("savepoint expected_error");
  try { await expect(db.query(sql)).rejects.toThrow(reason); }
  finally { await db.exec("rollback to savepoint expected_error; release savepoint expected_error"); }
}

test("migration enables ordered noon today and keeps pre-config days two-shift", async () => {
  const { rows } = await db.query<{ enabled: boolean; shifts: string[]; old: string[] }>(`
    select public.noon_enabled_on(public.farm_today()) enabled,
      public.expected_shifts(public.farm_today()) shifts,
      public.expected_shifts(date '2026-10-17') old`);
  expect(rows[0]).toEqual({ enabled: true, shifts: ["morning", "noon", "evening"], old: ["morning", "evening"] });
});

test("same-day toggle updates one row; OFF rejects new noon while retaining all saved data", async () => {
  await asOwner();
  await db.exec(save("noon", "null", 1));
  await db.exec("select public.set_noon_milk(false)");
  const off = await db.query<{ shifts: string[] }>("select public.expected_shifts(public.farm_today()) shifts");
  expect(off.rows[0].shifts).toEqual(["morning", "evening"]);
  const existing = await db.query<{ updated_at: string }>("select updated_at from public.milk_shifts where shift='noon'");
  await db.query("select public.save_milk_entry_checked(public.farm_today(),'noon',2,'total','[]'::jsonb,'[]'::jsonb,$1::timestamptz,'')", [existing.rows[0].updated_at]);
  const kept = await db.query<{ total_litres: string }>("select total_litres from public.milk_shifts where shift='noon'");
  expect(kept.rows[0].total_litres).toBe("2.00");
  await db.exec("select public.set_noon_milk(true)");
  const count = await db.query<{ count: number }>("select count(*)::int count from public.milk_shift_config where effective_from=public.farm_today()");
  expect(count.rows[0].count).toBe(1);
});

test("new noon entry is denied on an OFF date; stale edit remains denied", async () => {
  await asOwner();
  await db.exec("select public.set_noon_milk(false)");
  await rejects(save("noon"), /NOON_SHIFT_OFF/);
  await db.exec("select public.set_noon_milk(true)");
  await db.exec(save("noon"));
  await rejects(save("noon", "'2000-01-01'::timestamptz"), /MILK_STALE/);
});

test("a locked month and an expired subscription also reject noon writes", async () => {
  await asOwner();
  await db.exec("reset role; insert into public.month_locks(month) values ('2026-10-01')");
  await asOwner();
  await rejects(save("noon"), /MONTH_LOCKED/);
  await db.exec("reset role; delete from public.month_locks where month='2026-10-01'");
  await db.exec("reset role; update private.farm_subscription set expires_on='2026-10-19' where singleton=true");
  await asOwner();
  await rejects(save("noon"), /SUBSCRIPTION_EXPIRED/);
});

test("noon rate, customer balance, report and profit use the same saved delivery", async () => {
  await asOwner();
  const customer = await db.query<{ id: string }>("select public.create_customer('Noon buyer','regular','',0,0,150,0,public.farm_today(),null,2) id");
  const id = customer.rows[0].id;
  await db.exec(save("noon", "null", 5, `[{"customer_id":"${id}","litres":5}]`));
  const { rows } = await db.query<{ amount: string; rate: string; balance: string; report: string; pnl: string }>(`
    select d.amount::text amount,d.rate::text rate,b.balance::text balance,
      (select amount::text from public.customer_month_report(public.farm_today()) r where r.customer_id=d.customer_id) report,
      (select milk_income::text from public.pnl_month(public.farm_today())) pnl
    from public.milk_deliveries d join public.customer_balances b on b.customer_id=d.customer_id
    where d.customer_id='${id}'`);
  expect(rows[0]).toEqual({ amount: "750.00", rate: "150.00", balance: "750.00", report: "750.00", pnl: "750.00" });
});

test("three shift production sums to 100 L and OFF retains noon deliveries and defaults", async () => {
  await asOwner();
  const customer = await db.query<{ id: string }>("select public.create_customer('Three shifts','regular','',0,0,150,0,public.farm_today(),null,2) id");
  const id = customer.rows[0].id;
  await db.exec(save("morning", "null", 40));
  await db.exec(save("noon", "null", 25, `[{"customer_id":"${id}","litres":2}]`));
  await db.exec(save("evening", "null", 35));
  const totals = await db.query<{ produced: string; delivered: string }>("select produced::text,delivered::text from public.milk_month_summary(public.farm_today())");
  expect(totals.rows[0]).toEqual({ produced: "100.00", delivered: "2.00" });
  await db.exec("select public.set_noon_milk(false)");
  const kept = await db.query<{ deliveries: number; default_noon: string }>(`
    select (select count(*)::int from public.milk_deliveries where shift='noon') deliveries,
      (select default_noon::text from public.customers where id='${id}') default_noon`);
  expect(kept.rows[0]).toEqual({ deliveries: 1, default_noon: "2.00" });
});

test("customer RPC has one signature and noon defaults to zero when omitted", async () => {
  await asOwner();
  await db.exec("select public.create_customer('Old format','regular','',0,0,150,0,public.farm_today())");
  await db.exec("select public.create_customer('New format','regular','',0,0,150,0,public.farm_today(),null,2)");
  const { rows } = await db.query<{ name: string; default_noon: string }>("select name,default_noon::text from public.customers order by name");
  expect(rows).toEqual([{ name: "New format", default_noon: "2.00" }, { name: "Old format", default_noon: "0.00" }]);
  const signature = await db.query<{ count: number }>("select count(*)::int count from pg_proc where pronamespace='public'::regnamespace and proname='create_customer'");
  expect(signature.rows[0].count).toBe(1);
});

test("anon cannot see config or call the toggle on a production-like database", async () => {
  await db.exec("set role anon");
  await rejects("select * from public.milk_shift_config", /permission|denied/i);
  await rejects("select public.set_noon_milk(false)", /permission|denied/i);
});
