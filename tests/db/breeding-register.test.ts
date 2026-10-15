import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
let mother: string;
const migrations = resolve("supabase/migrations");

async function service(tag: string): Promise<string> {
  return (await db.query<{ id: string }>(
    "insert into inseminations (animal_id, service_date, semen_type, semen_name) values ($1, farm_today() - 200, 'sexed', $2) returning id",
    [mother, tag],
  )).rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  for (const name of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort())
    await db.exec(readFileSync(resolve(migrations, name), "utf8"));
  mother = (await db.query<{ id: string }>(
    "insert into animals (tag, sex, source, birth_date, arrival_date) values ('MOTHER-QA', 'female', 'born', farm_today() - 1200, farm_today() - 1200) returning id",
  )).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

it("creates one live calf with a temporary ID and returns the same calving on retry", async () => {
  const breeding = await service("SIRE-ONE");
  const request = crypto.randomUUID();
  const children = [{ outcome: "alive", sex: "female", birth_weight_kg: "32.50" }];
  const args = [request, breeding, JSON.stringify(children)];
  const first = (await db.query<{ id: string }>(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb, 2::smallint, 'Asaan paidaish') as id", args,
  )).rows[0].id;
  const retry = (await db.query<{ id: string }>(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb, 2::smallint, 'Asaan paidaish') as id", args,
  )).rows[0].id;
  expect(retry).toBe(first);
  expect((await db.query("select status from inseminations where id = $1", [breeding])).rows).toEqual([{ status: "calved" }]);
  const rows = (await db.query<{ tag: string; mother_id: string; source: string; sex: string; birth_weight_kg: string; calf_id: string }>(`
    select a.tag, a.mother_id, a.source, a.sex, o.birth_weight_kg, c.calf_id
      from calving_offspring o join animals a on a.id = o.animal_id
      join calvings c on c.id = o.calving_id where c.id = $1`, [first])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ mother_id: mother, source: "born", sex: "female", birth_weight_kg: "32.50" });
  expect(rows[0].tag).toMatch(/^TEMP-[a-f0-9]{12}$/);
  expect(rows[0].calf_id).not.toBeNull();
  await expect(db.query(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb, 2::smallint, 'Changed')",
    args,
  )).rejects.toThrow(/CALVING_REQUEST_CHANGED/);
  await expect(db.query("update calvings set calving_date = farm_today() - 1 where id = $1", [first]))
    .rejects.toThrow(/CALVING_OFFSPRING_IMMUTABLE/);
  await expect(db.query("update animals set mother_id = null where id = $1", [rows[0].calf_id]))
    .rejects.toThrow(/CALF_BIRTH_IMMUTABLE/);
  await expect(db.query("update animals set sex = 'male' where id = $1", [rows[0].calf_id]))
    .rejects.toThrow(/CALF_BIRTH_IMMUTABLE/);
  await expect(db.query("update animals set species = 'buffalo' where id = $1", [rows[0].calf_id]))
    .rejects.toThrow(/CALF_BIRTH_IMMUTABLE/);
  await db.query("update animals set tag = 'NEW-TAG' where id = $1", [rows[0].calf_id]);
});

it("keeps distinct twin outcomes and creates only the live calf in the herd", async () => {
  const breeding = await service("SIRE-TWIN");
  const request = crypto.randomUUID();
  const children = [
    { outcome: "stillborn", sex: "male", notes: "Paidaish par wafat" },
    { outcome: "alive", sex: "female", tag: "TWIN-QA", birth_weight_kg: "28" },
  ];
  const id = (await db.query<{ id: string }>(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb, null::smallint, 'Joray') as id",
    [request, breeding, JSON.stringify(children)],
  )).rows[0].id;
  expect((await db.query("select outcome from calvings where id = $1", [id])).rows).toEqual([{ outcome: "twins" }]);
  expect((await db.query("select birth_order, outcome, sex, animal_id is not null as linked from calving_offspring where calving_id = $1 order by birth_order", [id])).rows)
    .toEqual([{ birth_order: 1, outcome: "stillborn", sex: "male", linked: false }, { birth_order: 2, outcome: "alive", sex: "female", linked: true }]);
  expect((await db.query("select count(*)::int as count from animals where tag = 'TWIN-QA' and mother_id = $1", [mother])).rows)
    .toEqual([{ count: 1 }]);
});

it("records a stillbirth without inventing a living calf", async () => {
  const breeding = await service("SIRE-STILL");
  const id = (await db.query<{ id: string }>(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb) as id",
    [crypto.randomUUID(), breeding, JSON.stringify([{ outcome: "stillborn", notes: "Paidaish par wafat" }])],
  )).rows[0].id;
  expect((await db.query("select outcome, calf_id from calvings where id = $1", [id])).rows)
    .toEqual([{ outcome: "dead", calf_id: null }]);
  expect((await db.query("select outcome, animal_id from calving_offspring where calving_id = $1", [id])).rows)
    .toEqual([{ outcome: "stillborn", animal_id: null }]);
});

it("rolls back invalid calves and duplicate tags without closing breeding", async () => {
  const breeding = await service("SIRE-INVALID");
  const request = crypto.randomUUID();
  await expect(db.query(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb)",
    [request, breeding, JSON.stringify([{ outcome: "alive", sex: "female", birth_weight_kg: "-1" }])],
  )).rejects.toThrow(/CALVING_INVALID_CHILD/);
  await expect(db.query(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb)",
    [request, breeding, JSON.stringify([{ outcome: "alive" }])],
  )).rejects.toThrow(/CALVING_INVALID_CHILD/);
  await expect(db.query(
    "select record_calving_with_offspring($1, $2, farm_today() + 1, $3::jsonb)",
    [request, breeding, JSON.stringify([{ outcome: "alive", sex: "female" }])],
  )).rejects.toThrow(/CALVING_INVALID/);
  await expect(db.query(
    "select record_calving_with_offspring($1, $2, farm_today(), $3::jsonb)",
    [request, breeding, JSON.stringify([{ outcome: "alive", sex: "female", tag: "TWIN-QA" }])],
  )).rejects.toThrow(/animals_active_tag_uq/);
  expect((await db.query("select status from inseminations where id = $1", [breeding])).rows).toEqual([{ status: "pending" }]);
  expect((await db.query("select count(*)::int as count from calvings where insemination_id = $1", [breeding])).rows)
    .toEqual([{ count: 0 }]);
  await db.query("update inseminations set status = 'empty' where id = $1", [breeding]);
});

it("does not grant anonymous users access in the owner-only project configuration", async () => {
  await db.exec("set role anon");
  try {
    await expect(db.query("select id from calving_offspring limit 1"))
      .rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

it("rejects direct offspring writes and keeps the old calving RPC usable", async () => {
  const breeding = await service("SIRE-LEGACY");
  const old = (await db.query<{ id: string }>(
    "select record_calving($1, farm_today(), 'alive', 'Older client') as id", [breeding],
  )).rows[0].id;
  await expect(db.query(
    "insert into calving_offspring (calving_id, birth_order, outcome, sex) values ($1, 1, 'stillborn', 'male')", [old],
  )).rejects.toThrow(/CALVING_USE_RPC/);
  expect((await db.query("select count(*)::int as count from calving_offspring where calving_id = $1", [old])).rows)
    .toEqual([{ count: 0 }]);
});
