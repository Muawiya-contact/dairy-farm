import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
const today = "2026-10-20";

beforeAll(async () => { db = await freshFarmDb({ farmDay: today }); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

async function addAnimal(tag: string, milkingStatus: "milking" | "dry" = "milking"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.animals(tag,arrival_date,milking_status) values($1,'2025-01-01',$2) returning id",
    [tag, milkingStatus],
  );
  return rows[0].id;
}

async function createBreeding(animalId: string, date = "2026-01-01", status = "pregnant"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.inseminations(animal_id,service_date,status) values($1,$2,$3) returning id",
    [animalId, date, status],
  );
  return rows[0].id;
}

test("manual due dates stay fixed while calculated dates preserve frozen offsets", async () => {
  const animal = await addAnimal("OVERRIDE-COW");
  const record = await createBreeding(animal);

  await db.query(`update public.inseminations set ultrasound_due_override='2026-02-10',
    dry_off_due_override='2026-08-10', calving_due_override='2026-10-10' where id=$1`, [record]);
  let dates = await db.query<{ ultrasound_due: string; checkup_due: string; dry_off_due: string; calving_due: string; checkup_due_override: string | null }>(`
    select to_char(ultrasound_due,'YYYY-MM-DD') ultrasound_due,to_char(checkup_due,'YYYY-MM-DD') checkup_due,
      to_char(dry_off_due,'YYYY-MM-DD') dry_off_due,to_char(calving_due,'YYYY-MM-DD') calving_due,
      to_char(checkup_due_override,'YYYY-MM-DD') checkup_due_override
    from public.inseminations where id=$1`, [record]);
  expect(dates.rows[0]).toEqual({ ultrasound_due: "2026-02-05", checkup_due: "2026-04-26", dry_off_due: "2026-07-30", calving_due: "2026-09-28", checkup_due_override: null });

  await db.query("update public.inseminations set checkup_due_override='2026-05-15' where id=$1", [record]);
  await db.exec("update public.settings set ultrasound_days=40,checkup_days=80,dry_off_days=220,calving_days=280 where id=1");
  await db.query("update public.inseminations set service_date='2026-01-04' where id=$1", [record]);
  dates = await db.query(`select to_char(ultrasound_due,'YYYY-MM-DD') ultrasound_due,to_char(checkup_due,'YYYY-MM-DD') checkup_due,
    to_char(dry_off_due,'YYYY-MM-DD') dry_off_due,to_char(calving_due,'YYYY-MM-DD') calving_due,
    to_char(ultrasound_due_override,'YYYY-MM-DD') ultrasound_due_override,
    to_char(checkup_due_override,'YYYY-MM-DD') checkup_due_override,
    to_char(dry_off_due_override,'YYYY-MM-DD') dry_off_due_override,
    to_char(calving_due_override,'YYYY-MM-DD') calving_due_override
    from public.inseminations where id=$1`, [record]);
  expect(dates.rows[0]).toEqual({ ultrasound_due: "2026-02-08", checkup_due: "2026-04-26", dry_off_due: "2026-08-02", calving_due: "2026-10-01",
    ultrasound_due_override: "2026-02-10", checkup_due_override: "2026-05-15", dry_off_due_override: "2026-08-10", calving_due_override: "2026-10-10" });

  await db.query("update public.inseminations set ultrasound_due_override=null,checkup_due_override=null where id=$1", [record]);
  dates = await db.query<{ ultrasound_due: string; checkup_due: string; dry_off_due: string; calving_due: string; checkup_due_override: string | null }>(`select to_char(ultrasound_due,'YYYY-MM-DD') ultrasound_due,
    to_char(checkup_due,'YYYY-MM-DD') checkup_due from public.inseminations where id=$1`, [record]);
  expect(dates.rows[0]).toEqual({ ultrasound_due: "2026-02-08", checkup_due: "2026-04-24" });
});

test("breeding alerts use overrides at 7, 3, 1, due and overdue boundaries", async () => {
  const animal = await addAnimal("BREEDING-ALERT");
  const record = await createBreeding(animal, "2026-01-01", "pending");
  await db.query("update public.inseminations set ultrasound_due_override='2026-10-27' where id=$1", [record]);

  async function alert(date: string) {
    const { rows } = await db.query<{ alert_kind: string; due_date: string; days_left: number; severity: string }>(
      "select alert_kind,due_date::text,days_left,severity from public.animal_breeding_alerts($1::date) where animal_id=$2",
      [date, animal],
    );
    return rows.find((row) => row.alert_kind === "ultrasound");
  }

  expect(await alert("2026-10-20")).toMatchObject({ due_date: "2026-10-27", days_left: 7, severity: "upcoming" });
  expect(await alert("2026-10-24")).toMatchObject({ days_left: 3, severity: "soon" });
  expect(await alert("2026-10-26")).toMatchObject({ days_left: 1, severity: "soon" });
  expect(await alert("2026-10-27")).toMatchObject({ days_left: 0, severity: "today" });
  expect(await alert("2026-10-29")).toMatchObject({ days_left: -2, severity: "overdue" });

  await db.exec("update public.settings set reminder_days=3 where id=1");
  expect(await alert("2026-10-20")).toBeUndefined();
  expect(await alert("2026-10-24")).toMatchObject({ days_left: 3 });
});

test("care tasks remain active until completed and completed or inactive tasks do not alert", async () => {
  const active = await addAnimal("CARE-ACTIVE");
  const inactive = await addAnimal("CARE-INACTIVE");
  await db.query("select public.close_animal($1,'dead','2026-10-19',null,null,null)", [inactive]);
  const { rows: activeRows } = await db.query<{ id: string; title: string }>(`
    insert into public.animal_care_tasks(animal_id,category,title,due_date) values
      ($1,'vaccination','FMD vaccine','2026-10-18'),
      ($1,'heat','Next heat check','2026-10-20'),
      ($1,'custom','Follow-up','2026-10-27'),
      ($1,'checkup','Old completed check','2026-10-20') returning id,title`, [active]);
  const completed = activeRows.find((row) => row.title === "Old completed check")!;
  await db.query("update public.animal_care_tasks set completed_date='2026-10-20',completion_notes='Completed at visit' where id=$1", [completed.id]);
  await db.query("insert into public.animal_care_tasks(animal_id,category,title,due_date) values($1,'custom','Inactive reminder','2026-10-20')", [inactive]);

  const alerts = await db.query<{ alert_kind: string; severity: string; days_left: number; tag: string }>(
    "select alert_kind,severity,days_left,tag from public.animal_care_alerts('2026-10-20') order by days_left,alert_kind",
  );
  expect(alerts.rows).toEqual([
    { alert_kind: `care_task_${activeRows.find((row) => row.title === "FMD vaccine")!.id}`, severity: "overdue", days_left: -2, tag: "CARE-ACTIVE" },
    { alert_kind: `care_task_${activeRows.find((row) => row.title === "Next heat check")!.id}`, severity: "today", days_left: 0, tag: "CARE-ACTIVE" },
    { alert_kind: `care_task_${activeRows.find((row) => row.title === "Follow-up")!.id}`, severity: "upcoming", days_left: 7, tag: "CARE-ACTIVE" },
  ]);

  const vaccine = activeRows.find((row) => row.title === "FMD vaccine")!;
  const heat = activeRows.find((row) => row.title === "Next heat check")!;
  await db.query("update public.animal_care_tasks set completed_date='2026-10-20',completion_notes='Done' where id=$1", [vaccine.id]);
  expect((await db.query("select 1 from public.animal_care_alerts('2026-10-20') where alert_kind=$1", [`care_task_${vaccine.id}`])).rows).toEqual([]);
  await db.exec("savepoint future_completion");
  try {
    await expect(db.query("update public.animal_care_tasks set completed_date='2026-10-21' where id=$1", [heat.id]))
      .rejects.toThrow("CARE_TASK_COMPLETION_IN_FUTURE");
  } finally { await db.exec("rollback to savepoint future_completion; release savepoint future_completion"); }
});
