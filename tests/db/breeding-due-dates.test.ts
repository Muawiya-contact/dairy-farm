import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
beforeAll(async () => { db = await freshFarmDb({ farmDay: "2026-10-20" }); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
const animal = async (tag: string) => {
  const { rows } = await db.query<{ id: string }>("insert into public.animals(tag,arrival_date,source) values($1,'2025-01-01','purchased') returning id", [tag]);
  return rows[0].id;
};
const dates = (id: string) => db.query<{ ultrasound_due: string; checkup_due: string; dry_off_due: string; calving_due: string }>(`
  select to_char(ultrasound_due,'YYYY-MM-DD') ultrasound_due,to_char(checkup_due,'YYYY-MM-DD') checkup_due,
    to_char(dry_off_due,'YYYY-MM-DD') dry_off_due,to_char(calving_due,'YYYY-MM-DD') calving_due
  from public.inseminations where animal_id='${id}'`);

test("AI on 1 January follows the client's 35, ultrasound+75, 210, 270 schedule", async () => {
  const id = await animal("Formula 1");
  await db.query("insert into public.inseminations(animal_id,service_date) values($1,'2026-01-01')", [id]);
  expect((await dates(id)).rows[0]).toEqual({ ultrasound_due: "2026-02-05", checkup_due: "2026-04-21", dry_off_due: "2026-07-30", calving_due: "2026-09-28" });
  await db.query("update public.inseminations set ultrasound_date='2026-02-08' where animal_id=$1", [id]);
  expect((await dates(id)).rows[0].checkup_due).toBe("2026-04-24");
  await db.query("update public.inseminations set ultrasound_date=null where animal_id=$1", [id]);
  expect((await dates(id)).rows[0].checkup_due).toBe("2026-04-21");
});

test("service-date edits shift the frozen due dates and later settings edits do not", async () => {
  const id = await animal("Formula 2");
  await db.query("insert into public.inseminations(animal_id,service_date) values($1,'2026-01-01')", [id]);
  await db.exec("update public.settings set ultrasound_days=40,checkup_days=80 where id=1");
  expect((await dates(id)).rows[0].ultrasound_due).toBe("2026-02-05");
  await db.query("update public.inseminations set service_date='2026-01-04' where animal_id=$1", [id]);
  expect((await dates(id)).rows[0]).toEqual({ ultrasound_due: "2026-02-08", checkup_due: "2026-04-24", dry_off_due: "2026-08-02", calving_due: "2026-10-01" });
});

test("migration fixes open legacy cycles but preserves closed and owner-custom settings", async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    const dir = resolve("supabase/migrations");
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".sql") && file < "20261018000003_breeding_due_dates.sql").sort()) {
      await legacy.exec(readFileSync(resolve(dir, name), "utf8"));
    }
    await legacy.exec(`insert into public.animals(tag,arrival_date) values ('Open','2025-01-01'),('Closed','2025-01-01'),('Done','2025-01-01');
      insert into public.inseminations(animal_id,service_date,status) select id,'2026-01-01',
        case tag when 'Closed' then 'empty' else 'pending' end from public.animals;
      update public.inseminations set ultrasound_date='2026-02-05' where animal_id=(select id from public.animals where tag='Done');
      update public.settings set ultrasound_days=40 where id=1;`);
    await legacy.exec(readFileSync(resolve(dir, "20261018000003_breeding_due_dates.sql"), "utf8"));
    const { rows } = await legacy.query<{ tag: string; ultrasound_due: string; checkup_due: string }>(`
      select a.tag,to_char(i.ultrasound_due,'YYYY-MM-DD') ultrasound_due,to_char(i.checkup_due,'YYYY-MM-DD') checkup_due
      from public.inseminations i join public.animals a on a.id=i.animal_id order by a.tag`);
    expect(rows).toEqual([
      { tag: "Closed", ultrasound_due: "2026-01-31", checkup_due: "2026-03-17" },
      { tag: "Done", ultrasound_due: "2026-01-31", checkup_due: "2026-04-21" },
      { tag: "Open", ultrasound_due: "2026-02-05", checkup_due: "2026-04-21" },
    ]);
    const setting = await legacy.query<{ ultrasound_days: number }>("select ultrasound_days from public.settings where id=1");
    expect(setting.rows[0].ultrasound_days).toBe(40);
  } finally { await legacy.close(); }
}, 30_000);
