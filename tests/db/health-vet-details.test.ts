import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let demoDb: PGlite;
let animal: string;
let account: string;
let category: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  animal = (await db.query<{ id: string }>("insert into animals(tag,arrival_date) values('HEALTH-DETAIL','2025-01-01') returning id")).rows[0].id;
  account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  category = (await db.query<{ id: string }>("select id from expense_categories where name='Dawai / vet'")).rows[0].id;
  await db.query("update accounts set opening_date='2025-01-01' where id=$1", [account]);
  demoDb = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true });
}, 30_000);
afterAll(async () => { await db?.close(); await demoDb?.close(); });
beforeEach(async () => { await db.exec("reset role; reset request.jwt.claim.sub"); });

test("owner-only migration preserves veterinary details already recorded", async () => {
  const migrationDb = await freshFarmDb({ farmDay: "2026-10-20", stopAfterMigration: "20261121000009_health_attachment_demo_owner_guard.sql" });
  try {
    const legacyAnimal = (await migrationDb.query<{ id: string }>(
      "insert into animals(tag,arrival_date) values('HEALTH-MIGRATION','2025-01-01') returning id",
    )).rows[0].id;
    const eventId = (await migrationDb.query<{ id: string }>(`select public.record_detailed_health_event(
      $1,'2026-10-20','treatment','Existing clinical note',0,null,null,null,null,null,null,
      'Recorded symptoms','Recorded diagnosis','moderate','Recovering','Medicine','Dose','Route','2026-10-18','2026-10-22') as id`,
    [legacyAnimal])).rows[0].id;
    await migrationDb.exec(readFileSync(resolve("supabase/migrations/20261121000010_owner_only_veterinary_details.sql"), "utf8"));
    expect((await migrationDb.query(`select symptoms,diagnosis,severity,current_condition,medicine_type,dosage,route,
      to_char(treatment_start_date,'YYYY-MM-DD') treatment_start_date,
      to_char(treatment_end_date,'YYYY-MM-DD') treatment_end_date
      from health_event_details where health_event_id=$1`, [eventId])).rows[0]).toEqual({
      symptoms: "Recorded symptoms", diagnosis: "Recorded diagnosis", severity: "moderate", current_condition: "Recovering",
      medicine_type: "Medicine", dosage: "Dose", route: "Route", treatment_start_date: "2026-10-18", treatment_end_date: "2026-10-22",
    });
    expect((await migrationDb.query("select column_name from information_schema.columns where table_schema='public' and table_name='health_events' and column_name='diagnosis'")).rows)
      .toEqual([]);
  } finally { await migrationDb.close(); }
});

test("detailed veterinary history links its cost once and keeps unknown details optional", async () => {
  const { rows } = await db.query<{ id: string }>(`select public.record_detailed_health_event(
    $1,$2,'treatment','Hoof check',175,$3,$4,$5,'Oxytetracycline','Dr. Farm','Keep dry',
    'Limping after the walk','Hoof injury','moderate','Under treatment','Antibiotic','As prescribed',
    'Topical','2026-10-18','2026-10-22') as id`,
  [animal, "2026-10-20", "2026-10-27", category, account]);
  const event = await db.query(`select h.kind,h.title,h.medicine,h.vet,h.cost,to_char(h.next_due_date,'YYYY-MM-DD') next_due_date,h.expense_id,
      d.symptoms,d.diagnosis,d.severity,d.current_condition,d.medicine_type,d.dosage,d.route,
      to_char(d.treatment_start_date,'YYYY-MM-DD') treatment_start_date,
      to_char(d.treatment_end_date,'YYYY-MM-DD') treatment_end_date
    from health_events h left join health_event_details d on d.health_event_id=h.id where h.id=$1`, [rows[0].id]);
  expect(event.rows[0]).toMatchObject({ kind: "treatment", title: "Hoof check", medicine: "Oxytetracycline",
    vet: "Dr. Farm", cost: "175.00", next_due_date: "2026-10-27", expense_id: expect.any(String),
    symptoms: "Limping after the walk", diagnosis: "Hoof injury", severity: "moderate",
    current_condition: "Under treatment", medicine_type: "Antibiotic", dosage: "As prescribed",
    route: "Topical", treatment_start_date: "2026-10-18", treatment_end_date: "2026-10-22" });
  expect((await db.query<{ count: number }>("select count(*)::int as count from expenses where note='Hoof check'")).rows[0].count).toBe(1);

  await db.query(`select public.record_detailed_health_event(
    $1,$2,'checkup','Legacy style checkup',0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null)`,
  [animal, "2026-10-20"]);
  expect((await db.query(`select d.diagnosis,h.medicine,d.severity from health_events h
    left join health_event_details d on d.health_event_id=h.id where h.title='Legacy style checkup'`)).rows)
    .toEqual([{ diagnosis: null, medicine: null, severity: null }]);
});

test("a failed detailed health insert rolls back its expense as well", async () => {
  const invalidAnimal = "99999999-9999-4999-8999-999999999999";
  const before = (await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count;
  await expect(db.query(`select public.record_detailed_health_event(
    $1,'2026-10-20','treatment','Will roll back',90,null,$2,$3,
    null,null,null,'Limping',null,null,null,null,null,null,null,null)`, [invalidAnimal, category, account]))
    .rejects.toThrow();
  expect((await db.query<{ count: number }>("select count(*)::int as count from expenses")).rows[0].count).toBe(before);
});

test("attachment records and private objects are visible only to the designated farm owner", async () => {
  const { rows } = await db.query<{ id: string }>(`select public.record_detailed_health_event(
    $1,'2026-10-20','vaccine','FMD',0,null,null,null,'Product','Vet',null,'Clinical symptoms','Vet diagnosis',
    'mild',null,'Vaccine',null,null,null,null) as id`, [animal]);
  const eventId = rows[0].id;
  expect((await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
    "select public,file_size_limit,allowed_mime_types from storage.buckets where id='health-records'",
  )).rows[0]).toEqual({ public: false, file_size_limit: 10485760, allowed_mime_types: ["application/pdf", "image/jpeg", "image/png"] });
  const attachmentId = "33333333-3333-4333-8333-333333333333";
  const owner = "11111111-1111-4111-8111-111111111111";
  const stranger = "22222222-2222-4222-8222-222222222222";
  await db.exec(`insert into auth.users(id) values('${owner}'),('${stranger}');
    insert into private.app_editors(user_id) values('${stranger}');
    insert into private.app_owner(user_id) values('${owner}');
    set role authenticated; set request.jwt.claim.sub='${owner}';`);
  await db.query(`insert into storage.objects(bucket_id,name) values('health-records',$1)`,
    [`${eventId}/${attachmentId}.pdf`]);
  await db.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'prescription.pdf','application/pdf',900)`, [eventId, `${eventId}/${attachmentId}.pdf`]);
  expect((await db.query("select id from public.health_event_attachments")).rows).toHaveLength(1);
  expect((await db.query("select name from storage.objects where bucket_id='health-records'")).rows)
    .toEqual([{ name: `${eventId}/${attachmentId}.pdf` }]);
  expect((await db.query("select symptoms,diagnosis from public.health_event_details where health_event_id=$1", [eventId])).rows)
    .toEqual([{ symptoms: "Clinical symptoms", diagnosis: "Vet diagnosis" }]);

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${stranger}';`);
  expect((await db.query("select id from public.health_events where id=$1", [eventId])).rows).toHaveLength(1);
  expect((await db.query("select health_event_id from public.health_event_details where health_event_id=$1", [eventId])).rows).toEqual([]);
  await expect(db.query(`insert into public.health_event_details(health_event_id,diagnosis)
    values($1,'Private editor write')`, [eventId])).rejects.toThrow();
  expect((await db.query("select id from public.health_event_attachments")).rows).toEqual([]);
  expect((await db.query("select name from storage.objects where bucket_id='health-records'")).rows).toEqual([]);
  expect((await db.query("delete from storage.objects where bucket_id='health-records' returning name")).rows).toEqual([]);
  await expect(db.query("insert into storage.objects(bucket_id,name) values('health-records',$1)",
    [`${eventId}/77777777-7777-4777-8777-777777777777.pdf`])).rejects.toThrow();
  await expect(db.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'private.pdf','application/pdf',900)`, [eventId, `${eventId}/44444444-4444-4444-8444-444444444444.pdf`]))
    .rejects.toThrow();
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`);
  expect((await db.query("select symptoms,diagnosis from public.health_event_details where health_event_id=$1", [eventId])).rows)
    .toEqual([{ symptoms: "Clinical symptoms", diagnosis: "Vet diagnosis" }]);
});

test("attachment metadata rejects paths outside its event and files over the bucket limit", async () => {
  const { rows } = await db.query<{ id: string }>(
    "select public.record_health_event($1,'2026-10-20','vaccine','HS',0,null,null,null) as id", [animal]);
  const eventId = rows[0].id;
  await expect(db.query(`insert into health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'bad.pdf','application/pdf',100)`,
  [eventId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/44444444-4444-4444-8444-444444444444.pdf"]))
    .rejects.toThrow(/health_attachment_path_matches_event/);
  await expect(db.query(`insert into health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'large.pdf','application/pdf',10485761)`,
  [eventId, `${eventId}/44444444-4444-4444-8444-444444444444.pdf`]))
    .rejects.toThrow(/health_event_attachments_size_bytes_check/);
  await expect(db.query(`insert into health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'bad.gif','image/gif',100)`,
  [eventId, `${eventId}/55555555-5555-4555-8555-555555555555.png`]))
    .rejects.toThrow(/health_event_attachments_content_type_check/);
});

test("explicit staging demo access permits its synthetic anonymous health attachments", async () => {
  const demoAnimal = (await demoDb.query<{ id: string }>("insert into animals(tag,arrival_date) values('DEMO-HEALTH','2025-01-01') returning id")).rows[0].id;
  await demoDb.exec("set role anon;");
  const eventId = (await demoDb.query<{ id: string }>(`select public.record_detailed_health_event(
    $1,'2026-10-20','vaccine','Demo FMD',0,null,null,null,'Demo product',null,null,null,null,null,null,null,null,null,null,null) as id`,
  [demoAnimal])).rows[0].id;
  const objectPath = `${eventId}/33333333-3333-4333-8333-333333333333.pdf`;
  await demoDb.query("insert into storage.objects(bucket_id,name) values('health-records',$1)", [objectPath]);
  await demoDb.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'demo-report.pdf','application/pdf',900)`, [eventId, objectPath]);
  expect((await demoDb.query("select id from public.health_event_attachments where health_event_id=$1", [eventId])).rows).toHaveLength(1);
  expect((await demoDb.query("select name from storage.objects where bucket_id='health-records'")).rows).toEqual([{ name: objectPath }]);
});

test("demo attachments stay anonymous and are hidden from authenticated non-owners", async () => {
  const demoAnimal = (await demoDb.query<{ id: string }>("insert into animals(tag,arrival_date) values('DEMO-PRIVATE','2025-01-01') returning id")).rows[0].id;
  const eventId = (await demoDb.query<{ id: string }>(`select public.record_detailed_health_event(
    $1,'2026-10-20','vaccine','Private demo vaccine',0,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null) as id`,
  [demoAnimal])).rows[0].id;
  const objectPath = `${eventId}/77777777-7777-4777-8777-777777777777.pdf`;
  await demoDb.exec("set role anon;");
  await demoDb.query("insert into storage.objects(bucket_id,name) values('health-records',$1)", [objectPath]);
  await demoDb.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'demo-private.pdf','application/pdf',900)`, [eventId, objectPath]);
  expect((await demoDb.query("select id from public.health_event_attachments where health_event_id=$1", [eventId])).rows).toHaveLength(1);

  const stranger = "88888888-8888-4888-8888-888888888888";
  await demoDb.exec(`reset role; insert into auth.users(id) values('${stranger}');
    set role authenticated; set request.jwt.claim.sub='${stranger}';`);
  expect((await demoDb.query("select id from public.health_event_attachments")).rows).toEqual([]);
  expect((await demoDb.query("select name from storage.objects where bucket_id='health-records'")).rows).toEqual([]);
  await expect(demoDb.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'private.pdf','application/pdf',900)`,
  [eventId, `${eventId}/99999999-9999-4999-8999-999999999999.pdf`])).rejects.toThrow();
});

test("expired subscriptions block new attachment metadata for the farm owner", async () => {
  const { rows } = await db.query<{ id: string }>(
    "select public.record_health_event($1,'2026-10-20','vaccine','Existing vaccine',0,null,null,null) as id", [animal]);
  const eventId = rows[0].id;
  const owner = "44444444-4444-4444-8444-444444444444";
  await db.exec(`insert into auth.users(id) values ('${owner}');
    insert into private.app_owner(singleton,user_id) values (true,'${owner}') on conflict (singleton) do update set user_id=excluded.user_id;
    update private.farm_subscription set expires_on = public.farm_today() - 1;
    set role authenticated; set request.jwt.claim.sub='${owner}';`);
  await expect(db.query(`insert into public.health_event_attachments(health_event_id,storage_path,file_name,content_type,size_bytes)
    values($1,$2,'locked.pdf','application/pdf',900)`,
  [eventId, `${eventId}/66666666-6666-4666-8666-666666666666.pdf`])).rejects.toThrow(/SUBSCRIPTION_EXPIRED/);
  await db.exec(`reset role; reset request.jwt.claim.sub; update private.farm_subscription set expires_on = public.farm_today() + 365;
    update private.app_owner set user_id='11111111-1111-4111-8111-111111111111';`);
});
