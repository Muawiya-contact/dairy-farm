import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshFarmDb } from "./db-fixture";
import type { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let farmCash: string;
let owner: string;
let otherOwner: string;
let unrelatedPerson: string;
let bank: string;
let ownerUser: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-20", demo: true });
  farmCash = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  owner = (await db.query<{ id: string }>("select id from accounts where name = 'Demo Owner'")).rows[0].id;
  otherOwner = (await db.query<{ id: string }>(
    "insert into accounts(name,kind,is_owner) values ('Second owner','person',true) returning id",
  )).rows[0].id;
  unrelatedPerson = (await db.query<{ id: string }>(
    "insert into accounts(name,kind) values ('Unrelated person','person') returning id",
  )).rows[0].id;
  bank = (await db.query<{ id: string }>(
    "insert into accounts(name,kind) values ('Farm bank','bank') returning id",
  )).rows[0].id;
  ownerUser = "12111111-1111-4111-8111-111111111111";
  await db.query("insert into auth.users(id) values ($1)", [ownerUser]);
  await db.query("insert into private.app_owner(user_id) values ($1)", [ownerUser]);
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("owner transaction reporting and daily Galla close", () => {
  it("classifies explicit owner transfers once and leaves P&L unchanged", async () => {
    const beforeProfit = (await db.query("select * from pnl_month('2026-11-01')")).rows;
    await expect(db.query("insert into accounts(name,kind,is_owner) values ('Wrong owner kind','bank',true)"))
      .rejects.toThrow(/accounts_owner_must_be_person/);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerUser]);
    const actorTransfer = (await db.query<{ id: string }>(
      `insert into transfers(transfer_date,from_account_id,to_account_id,amount,note)
       values ('2026-11-10',$1,$2,100,'Owner withdrawal') returning id`, [farmCash, owner],
    )).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query(`
      insert into transfers(transfer_date,from_account_id,to_account_id,amount,note) values
        ('2026-11-10',$2,$1,40,'Owner deposit'),
        ('2026-11-11',$1,$3,200,'Second owner withdrawal'),
        ('2026-11-12',$3,$1,25,'Second owner deposit'),
        ('2026-11-10',$1,$4,300,'Unrelated person transfer'),
        ('2026-11-10',$5,$1,50,'Internal transfer in'),
        ('2026-11-10',$1,$5,60,'Internal transfer out'),
        ('2026-11-10',$4,$1,70,'Unrelated person deposit')
    `, [farmCash, owner, otherOwner, unrelatedPerson, bank]);

    const summary = (await db.query<{
      total_withdrawals: string; total_deposits: string; net_amount: string;
      withdrawal_count: string; deposit_count: string;
    }>("select * from owner_transfer_summary('2026-11-10','2026-11-11')")).rows[0];
    expect([Number(summary.total_withdrawals), Number(summary.total_deposits), Number(summary.net_amount),
      Number(summary.withdrawal_count), Number(summary.deposit_count)]).toEqual([300, 40, -260, 2, 1]);
    const allTime = (await db.query<{ total_withdrawals: string; total_deposits: string; net_amount: string }>(
      "select * from owner_transfer_summary('2000-01-01','2026-11-20')",
    )).rows[0];
    expect([Number(allTime.total_withdrawals), Number(allTime.total_deposits), Number(allTime.net_amount)])
      .toEqual([550, 315, -235]);
    await expect(db.query("select * from owner_transfer_summary('2026-11-20','2026-11-21')"))
      .rejects.toThrow(/REPORT_PERIOD_INVALID/);

    const pageOne = (await db.query<{ transfer_id: string; direction: string; recorded_by: string | null }>(
      "select transfer_id,direction,recorded_by from owner_transfer_rows('2026-11-10','2026-11-12',2,0)",
    )).rows;
    const pageTwo = (await db.query<{ transfer_id: string; direction: string; recorded_by: string | null }>(
      "select transfer_id,direction,recorded_by from owner_transfer_rows('2026-11-10','2026-11-12',2,2)",
    )).rows;
    const allRows = [...pageOne, ...pageTwo];
    expect(allRows).toHaveLength(4);
    expect(new Set(allRows.map((row) => row.transfer_id)).size).toBe(4);
    expect(allRows.map((row) => row.direction).sort()).toEqual(["deposit", "deposit", "withdrawal", "withdrawal"]);
    expect(allRows.find((row) => row.transfer_id === actorTransfer)?.recorded_by).toBe(ownerUser);
    expect(allRows.some((row) => row.recorded_by === null)).toBe(true);
    await expect(db.query("select * from owner_transfer_rows('2026-11-10','2026-11-12',0,0)"))
      .rejects.toThrow(/OWNER_TRANSFER_PAGE_INVALID/);
    await expect(db.query("update transfers set created_by = null where id = $1", [actorTransfer]))
      .rejects.toThrow(/TRANSFER_ACTOR_IMMUTABLE/);
    expect((await db.query("select * from pnl_month('2026-11-01')")).rows).toEqual(beforeProfit);

    await db.query("delete from auth.users where id = $1", [ownerUser]);
    const deletedActor = (await db.query<{ created_by: string | null }>(
      "select created_by from transfers where id = $1", [actorTransfer],
    )).rows[0];
    expect(deletedActor.created_by).toBeNull();
  });

  it("keeps owner reports private in production and grants them to staging demo access", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from owner_transfer_bounds()")).rejects.toThrow(/permission|denied/i);
      await expect(db.query("select * from owner_transfer_summary('2026-11-18','2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
      await expect(db.query("select * from galla_daily_closing((select id from accounts where is_farm_cash),'2026-11-20')"))
        .rejects.toThrow(/permission|denied/i);
    } finally { await db.exec("reset role"); }

    const demo = await freshFarmDb({ farmDay: "2026-11-20", demo: true, demoAccess: true });
    try {
      const cash = (await demo.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
      await demo.exec("set role anon");
      expect((await demo.query("select * from owner_transfer_bounds()")).rows).toHaveLength(1);
      expect((await demo.query("select * from owner_transfer_summary('2026-11-18','2026-11-20')")).rows).toHaveLength(1);
      expect((await demo.query("select * from owner_transfer_rows('2026-11-18','2026-11-20',50,0)")).rows).toHaveLength(2);
      expect((await demo.query("select * from galla_daily_closing($1,'2026-11-20')", [cash])).rows).toHaveLength(1);
    } finally { await demo.close(); }
  });

  it("reconciles daily cash, separates transfer types, and identifies stale counts", async () => {
    const expectedBefore = Number((await db.query<{ balance: string }>(
      "select account_balance_on($1,'2026-11-09') as balance", [farmCash],
    )).rows[0].balance);
    await db.query(
      "insert into cash_counts(account_id,count_date,counted_amount) values($1,'2026-11-09',$2)",
      [farmCash, expectedBefore],
    );
    await db.query(
      "insert into transfers(transfer_date,from_account_id,to_account_id,amount,note) values('2026-11-09',$1,$2,5,'Backdated after count')",
      [farmCash, owner],
    );

    const row = (await db.query<{
      opening_balance: string; money_received: string; money_paid: string; expected_closing: string;
      owner_deposits: string; owner_withdrawals: string; internal_transfers_in: string;
      internal_transfers_out: string; other_transfers_in: string; other_transfers_out: string;
      latest_count_date: Date | string; latest_count_difference: string; latest_count_is_stale: boolean;
    }>("select * from galla_daily_closing($1,'2026-11-10')", [farmCash])).rows[0];
    expect(Number(row.owner_deposits)).toBe(40);
    expect(Number(row.owner_withdrawals)).toBe(100);
    expect(Number(row.internal_transfers_in)).toBe(50);
    expect(Number(row.internal_transfers_out)).toBe(60);
    expect(Number(row.other_transfers_in)).toBe(70);
    expect(Number(row.other_transfers_out)).toBe(300);
    expect(Number(row.opening_balance) + Number(row.money_received) - Number(row.money_paid))
      .toBe(Number(row.expected_closing));
    expect(row.latest_count_date instanceof Date ? row.latest_count_date.toISOString().slice(0, 10) : row.latest_count_date)
      .toBe("2026-11-09");
    expect(Number(row.latest_count_difference)).toBe(0);
    expect(row.latest_count_is_stale).toBe(true);

    const withoutCount = (await db.query<{ latest_count_id: string | null }>(
      "select latest_count_id from galla_daily_closing($1,'2026-11-08')", [farmCash],
    )).rows[0];
    expect(withoutCount.latest_count_id).toBeNull();
    await expect(db.query("select * from galla_daily_closing($1,'2026-11-21')", [farmCash]))
      .rejects.toThrow(/GALLA_DATE_INVALID/);
    await expect(db.query("select * from galla_daily_closing($1,'2026-11-10')", [bank]))
      .rejects.toThrow(/FARM_GALLA_REQUIRED/);
  });
});
