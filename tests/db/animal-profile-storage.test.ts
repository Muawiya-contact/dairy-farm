import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

const dbs: PGlite[] = [];
async function database(options: { demoAccess?: boolean } = {}) {
  const db = await freshFarmDb(options);
  dbs.push(db);
  return db;
}
afterEach(async () => { await Promise.all(dbs.splice(0).map((db) => db.close())); });

const photoName = (animalId: string) => `${animalId}/8f20b206-00d2-4c31-bcec-f9490a634c95.jpg`;

describe("animal profile storage", () => {
  it("preserves nullable history and validates seller, location, and photo ownership paths", async () => {
    const db = await database();
    const animal = (await db.query<{ id: string }>("insert into animals(tag, arrival_date) values ('OLD-1', farm_today()) returning id")).rows[0];
    expect((await db.query("select seller_name, purchase_location, photo_path from animals where id = $1", [animal.id])).rows)
      .toEqual([{ seller_name: null, purchase_location: null, photo_path: null }]);

    await db.query("update animals set seller_name = 'Farm Market', purchase_location = 'Okara' where id = $1", [animal.id]);
    await db.query("update animals set purchase_location = null where id = $1", [animal.id]);
    await expect(db.query("update animals set source = 'gift' where id = $1", [animal.id])).rejects.toThrow(/animals_seller_name_check/);
    await expect(db.query("update animals set photo_path = $2 where id = $1", [animal.id, `00000000-0000-4000-8000-000000000000/${photoName(animal.id).split("/")[1]}`]))
      .rejects.toThrow(/animals_photo_path_check/);
    await db.query("update animals set photo_path = $2 where id = $1", [animal.id, photoName(animal.id)]);
    expect((await db.query("select photo_path from animals where id = $1", [animal.id])).rows).toEqual([{ photo_path: photoName(animal.id) }]);
  });

  it("allows demo visitors to access only photos attached to demo animals", async () => {
    const db = await database({ demoAccess: true });
    const animal = (await db.query<{ id: string }>("insert into animals(tag, arrival_date) values ('DEMO-1', farm_today()) returning id")).rows[0];
    const name = photoName(animal.id);
    await db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', $1)", [name]);
    await db.exec("set role anon");
    expect((await db.query("select name from storage.objects where bucket_id = 'animal-photos'")).rows).toEqual([{ name }]);
    await expect(db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', '00000000-0000-4000-8000-000000000000/8f20b206-00d2-4c31-bcec-f9490a634c95.webp')"))
      .rejects.toThrow(/row-level security/i);
  });

  it("denies anonymous photo access when demo sharing is disabled", async () => {
    const db = await database();
    const animal = (await db.query<{ id: string }>("insert into animals(tag, arrival_date) values ('PRIVATE-1', farm_today()) returning id")).rows[0];
    const name = photoName(animal.id);
    await db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', $1)", [name]);
    await db.exec("set role anon");
    expect((await db.query("select name from storage.objects where bucket_id = 'animal-photos'")).rows).toEqual([]);
    await expect(db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', $1)", [photoName(animal.id)]))
      .rejects.toThrow(/row-level security/i);
  });

  it("allows the farm owner and denies another signed-in user", async () => {
    const db = await database();
    const owner = "11111111-1111-4111-8111-111111111111";
    const outsider = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id) values ($1), ($2)", [owner, outsider]);
    await db.query("insert into private.app_owner(user_id) values ($1)", [owner]);
    const animal = (await db.query<{ id: string }>("insert into animals(tag, arrival_date) values ('OWNER-1', farm_today()) returning id")).rows[0];
    const name = photoName(animal.id);

    await db.exec(`set request.jwt.claim.sub = '${owner}'; set role authenticated`);
    await db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', $1)", [name]);
    expect((await db.query("select name from storage.objects where bucket_id = 'animal-photos'")).rows).toEqual([{ name }]);

    await db.exec(`reset role; set request.jwt.claim.sub = '${outsider}'; set role authenticated`);
    expect((await db.query("select name from storage.objects where bucket_id = 'animal-photos'")).rows).toEqual([]);
    await expect(db.query("insert into storage.objects(bucket_id, name) values ('animal-photos', $1)", [photoName(animal.id)]))
      .rejects.toThrow(/row-level security/i);
  });
});
