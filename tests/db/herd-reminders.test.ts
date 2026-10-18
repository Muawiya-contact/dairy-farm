import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => { db = await freshFarmDb({ farmDay: "2026-10-20" }); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

test("ultrasound window begins at 7 days and urgency follows the countdown", async () => {
  await db.exec(`insert into public.animals(tag,arrival_date) values('Reminder 1','2025-01-01');
    insert into public.inseminations(animal_id,service_date)
      select id,'2026-09-27' from public.animals where tag='Reminder 1';`);
  const on = async (date: string) => (await db.query<{ days_left: number; severity: string; message: string }>(
    "select days_left,severity,message from public.herd_alerts($1::date) where alert_kind='ultrasound'", [date],
  )).rows;
  // 27 Sep + 35 = 1 Nov. The eight-day query is invisible; the rest stay until done.
  expect(await on("2026-10-24")).toEqual([]);
  expect((await on("2026-10-25"))[0]).toMatchObject({ days_left: 7, severity: "upcoming" });
  expect((await on("2026-10-29"))[0]).toMatchObject({ days_left: 3, severity: "soon" });
  expect((await on("2026-11-01"))[0]).toMatchObject({ days_left: 0, severity: "today" });
  expect((await on("2026-11-03"))[0]).toMatchObject({ days_left: -2, severity: "overdue" });
  expect((await on("2026-11-03"))[0].message).toContain("2 din late");
});

test("completed, sold and dead records stop reminding; calving has a separate window", async () => {
  await db.exec(`insert into public.animals(tag,arrival_date,milking_status) values
      ('Done','2025-01-01','milking'),('Sold','2025-01-01','milking'),('Dead','2025-01-01','milking');
    insert into public.inseminations(animal_id,service_date,status)
      select id,'2026-09-01','pregnant' from public.animals;
    update public.inseminations set ultrasound_date='2026-10-06',checkup_date='2026-12-20',dry_off_date='2027-03-30'
      where animal_id=(select id from public.animals where tag='Done');
    insert into public.accounts(name,kind,opening_date) values('Reminder bank','bank','2025-01-01');
    select public.close_animal((select id from public.animals where tag='Sold'),'sold','2026-10-15',null,100,
      (select id from public.accounts where name='Reminder bank'));
    select public.close_animal((select id from public.animals where tag='Dead'),'dead','2026-10-15',null,null,null);`);
  const alerts = await db.query<{ tag: string; alert_kind: string }>("select tag,alert_kind from public.herd_alerts('2027-05-01')");
  expect(alerts.rows).toEqual([{ tag: "Done", alert_kind: "calving" }]);
});

test("settings windows are enforced for ordinary tasks and calving", async () => {
  await db.exec("update public.settings set reminder_days=3,calving_reminder_days=30 where id=1");
  await db.exec(`insert into public.animals(tag,arrival_date,milking_status) values('Short','2025-01-01','milking');
    insert into public.inseminations(animal_id,service_date,status)
      select id,'2026-09-27','pending' from public.animals where tag='Short';`);
  const before = await db.query("select * from public.herd_alerts('2026-10-27')");
  expect(before.rows).toEqual([]); // ultrasound due 1 Nov, five days ahead
  const inside = await db.query<{ alert_kind: string }>("select alert_kind from public.herd_alerts('2026-10-29')");
  expect(inside.rows).toEqual([{ alert_kind: "ultrasound" }]);
  await db.exec("update public.inseminations set status='pregnant' where animal_id=(select id from public.animals where tag='Short')");
  const calving = await db.query<{ alert_kind: string }>("select alert_kind from public.herd_alerts('2027-05-25') where alert_kind='calving'");
  expect(calving.rows).toEqual([{ alert_kind: "calving" }]);
});

test("database rejects invalid reminder windows", async () => {
  for (const value of [0,31]) {
    await db.exec("savepoint invalid_window");
    try { await expect(db.query("update public.settings set reminder_days=$1 where id=1", [value])).rejects.toThrow(); }
    finally { await db.exec("rollback to savepoint invalid_window; release savepoint invalid_window"); }
  }
});
