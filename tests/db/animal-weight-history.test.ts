import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let animalId: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-11-21" });
  animalId = (await db.query<{ id: string }>(`
    insert into animals(tag,species,sex,category,source,birth_date,arrival_date)
    values ('WEIGHT-CALF','cow','female','calf','born','2026-11-01','2026-11-01') returning id
  `)).rows[0].id;
}, 30_000);

afterAll(async () => { await db?.close(); });

describe("animal weight history database rules", () => {
  it("retains multiple dated measurements and notes for the same calf", async () => {
    await db.query(`insert into animal_weight_records(animal_id,weight_date,weight_kg,notes) values
      ($1,'2026-11-02',34.25,'Before feeding'),($1,'2026-11-02',34.50,'Second weighing'),($1,'2026-11-15',39.00,null)`, [animalId]);
    const rows = (await db.query<{ weight_date: string; weight_kg: string; notes: string | null }>(
      `select weight_date,weight_kg,notes from animal_weight_records where animal_id=$1 order by weight_date,created_at,id`, [animalId],
    )).rows;
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => Number(row.weight_kg))).toEqual([34.25, 34.5, 39]);
    expect(rows[0].notes).toBe("Before feeding");
  });

  it("rejects invalid weights, future dates, and entries before arrival", async () => {
    await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-02',0)", [animalId])).rejects.toThrow();
    await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-02',-1)", [animalId])).rejects.toThrow();
    await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-22',40)", [animalId])).rejects.toThrow(/ANIMAL_WEIGHT_DATE_IN_FUTURE/);
    await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-10-31',40)", [animalId])).rejects.toThrow(/ANIMAL_WEIGHT_BEFORE_FARM_ARRIVAL/);
  });

  it("preserves readings as append-only history and denies anonymous production access", async () => {
    const row = (await db.query<{ id: string }>("select id from animal_weight_records where animal_id=$1 limit 1", [animalId])).rows[0];
    await expect(db.query("update animal_weight_records set weight_kg=99 where id=$1", [row.id])).rejects.toThrow(/ANIMAL_WEIGHT_HISTORY_APPEND_ONLY/);
    await expect(db.query("delete from animal_weight_records where id=$1", [row.id])).rejects.toThrow(/ANIMAL_WEIGHT_HISTORY_APPEND_ONLY/);

    await db.exec("set role anon");
    try {
      await expect(db.query("select * from animal_weight_records")).rejects.toThrow(/permission|denied/i);
      await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-18',41)", [animalId]))
        .rejects.toThrow(/permission|denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("allows past growth records through the exit date and rejects later measurements", async () => {
    const exitedId = (await db.query<{ id: string }>(`
      insert into animals(tag,species,sex,category,source,birth_date,arrival_date)
      values ('WEIGHT-EXITED','cow','female','calf','born','2026-11-01','2026-11-01') returning id
    `)).rows[0].id;
    await db.query("select close_animal($1,'dead','2026-11-15','Test history',null,null)", [exitedId]);
    await db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-15',40)", [exitedId]);
    await expect(db.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-16',41)", [exitedId]))
      .rejects.toThrow(/ANIMAL_WEIGHT_AFTER_FARM_EXIT/);
    expect((await db.query("select weight_kg from animal_weight_records where animal_id=$1", [exitedId])).rows).toHaveLength(1);
  });

  it("grants anonymous access only when staging demo access is enabled", async () => {
    const demo = await freshFarmDb({ farmDay: "2026-11-21", demoAccess: true });
    try {
      const demoAnimal = (await demo.query<{ id: string }>(`
        insert into animals(tag,species,sex,category,source,birth_date,arrival_date)
        values ('WEIGHT-DEMO','cow','female','calf','born','2026-11-01','2026-11-01') returning id
      `)).rows[0].id;
      await demo.exec("set role anon");
      await demo.query("insert into animal_weight_records(animal_id,weight_date,weight_kg) values ($1,'2026-11-18',38)", [demoAnimal]);
      expect((await demo.query("select weight_kg from animal_weight_records where animal_id=$1", [demoAnimal])).rows).toHaveLength(1);
    } finally { await demo.close(); }
  }, 60_000);
});
