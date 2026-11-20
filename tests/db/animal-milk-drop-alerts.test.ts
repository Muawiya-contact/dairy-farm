import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
const today = "2026-10-08";

beforeAll(async () => { db = await freshFarmDb({ farmDay: today }); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

function dayOffset(daysAgo: number): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function addAnimal(tag: string, milkingStatus: "milking" | "dry" | "none" = "milking"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.animals(tag,arrival_date,milking_status) values($1,'2025-01-01',$2) returning id",
    [tag, milkingStatus],
  );
  return rows[0].id;
}

async function addMilk(animalId: string, date: string, shift: "morning" | "noon" | "evening", litres: number, mode = "per_animal"): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.milk_shifts(milk_date,shift,mode,total_litres) values($1,$2,$3,$4)
     on conflict (milk_date,shift) do update set mode=excluded.mode returning id`,
    [date, shift, mode, litres],
  );
  if (mode !== "per_animal") return null;
  const { rows: milkRows } = await db.query<{ id: string }>(
    "insert into public.animal_milk(shift_id,animal_id,litres) values($1,$2,$3) returning id",
    [rows[0].id, animalId, litres],
  );
  return milkRows[0].id;
}

async function dropAlerts(date = today) {
  const { rows } = await db.query<{ alert_kind: string; severity: string; due_date: string; animal_id: string; tag: string; message: string; days_left: number }>(
    "select alert_kind,severity,due_date::text as due_date,animal_id,tag,message,days_left from public.herd_alerts($1::date)", [date],
  );
  return rows.filter((row) => row.alert_kind.startsWith("milk_drop_"));
}

test("compares morning and evening with seven completed days and recalculates after a correction", async () => {
  const animal = await addAnimal("SHIFT-BASELINE");
  let historicalMorningId: string | null = null;
  for (let ago = 1; ago <= 7; ago++) {
    const id = await addMilk(animal, dayOffset(ago), "morning", 10);
    if (ago === 1) historicalMorningId = id;
    await addMilk(animal, dayOffset(ago), "evening", 8);
  }
  const morningId = await addMilk(animal, today, "morning", 8);
  expect((await dropAlerts()).map((alert) => alert.alert_kind)).toEqual(["milk_drop_morning"]);
  await addMilk(animal, today, "evening", 6.4);

  const alerts = await dropAlerts();
  expect(alerts).toHaveLength(2);
  expect(alerts.map((alert) => alert.alert_kind)).toEqual(["milk_drop_evening", "milk_drop_morning"]);
  for (const alert of alerts) {
    expect(alert).toMatchObject({ severity: "today", due_date: today, animal_id: animal, tag: "SHIFT-BASELINE", days_left: 0 });
    expect(alert.message).toContain("7 din ke ausat");
    expect(alert.message).toContain("20.0%");
  }
  expect(alerts.find((alert) => alert.alert_kind === "milk_drop_morning")?.message)
    .toContain("ausat 10.00 L, aaj 8.00 L; 2.00 L");
  expect(alerts.find((alert) => alert.alert_kind === "milk_drop_evening")?.message)
    .toContain("ausat 8.00 L, aaj 6.40 L; 1.60 L");

  await db.query("update public.animal_milk set litres=8.01 where id=$1", [morningId]);
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(false);
  await db.query("update public.animal_milk set litres=8 where id=$1", [morningId]);
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(true);

  await db.query("update public.animal_milk set litres=0 where id=$1", [historicalMorningId]);
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(false);
  await db.query("update public.animal_milk set litres=10 where id=$1", [historicalMorningId]);
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(true);
});

test("compares an optional noon session only with prior noon sessions and labels it correctly", async () => {
  const animal = await addAnimal("THREE-SHIFT");
  for (let ago = 1; ago <= 7; ago++) {
    await addMilk(animal, dayOffset(ago), "morning", 10);
    await addMilk(animal, dayOffset(ago), "noon", 6);
    await addMilk(animal, dayOffset(ago), "evening", 8);
  }
  await addMilk(animal, today, "morning", 8);
  await addMilk(animal, today, "noon", 4.8);

  const alerts = await dropAlerts();
  expect(alerts.map((alert) => alert.alert_kind)).toEqual(["milk_drop_morning", "milk_drop_noon"]);
  expect(alerts[0].message).toContain("subah ka doodh");
  expect(alerts[1].message).toContain("dopehr ka doodh");
  expect(alerts[1].message).not.toContain("shaam ka doodh");
});

test("ignores missing dates as zero, excludes the eighth prior day, and waits for five comparable days", async () => {
  const enoughHistory = await addAnimal("SPARSE-OK");
  const tooLittleHistory = await addAnimal("SPARSE-WAIT");
  await addMilk(enoughHistory, dayOffset(8), "morning", 60);
  for (let ago = 1; ago <= 5; ago++) await addMilk(enoughHistory, dayOffset(ago), "morning", 10);
  for (let ago = 1; ago <= 4; ago++) await addMilk(tooLittleHistory, dayOffset(ago), "morning", 10);
  await addMilk(enoughHistory, today, "morning", 7.9);
  await addMilk(tooLittleHistory, today, "morning", 0);

  const alerts = await dropAlerts();
  expect(alerts.map((alert) => alert.tag)).toEqual(["SPARSE-OK"]);
  expect(alerts[0].message).toContain("ausat 10.00 L");
  expect(alerts[0].message).toContain("21.0%");
});

test("ignores total-only milk, zero baselines, dry animals, and closed animals", async () => {
  const totalOnly = await addAnimal("TOTAL-ONLY");
  const zeroBaseline = await addAnimal("ZERO-BASE");
  const dry = await addAnimal("DRY-COW", "dry");
  const closed = await addAnimal("CLOSED-COW");

  await addMilk(totalOnly, today, "morning", 4, "total");
  for (let ago = 1; ago <= 7; ago++) {
    await addMilk(zeroBaseline, dayOffset(ago), "morning", 0);
    await addMilk(dry, dayOffset(ago), "morning", 10);
    await addMilk(closed, dayOffset(ago), "morning", 10);
  }
  await addMilk(zeroBaseline, today, "morning", 0);
  await addMilk(dry, today, "morning", 0);
  await addMilk(closed, today, "morning", 0);
  await db.query("select public.close_animal($1,'dead',$2::date,null,null,null)", [closed, today]);

  expect(await dropAlerts()).toEqual([]);
});

test("uses the owner-configured threshold and rejects invalid threshold settings", async () => {
  const animal = await addAnimal("CONFIGURED-THRESHOLD");
  for (let ago = 1; ago <= 7; ago++) await addMilk(animal, dayOffset(ago), "morning", 10);
  await addMilk(animal, today, "morning", 7);

  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(true);
  await db.query("update public.settings set milk_drop_threshold_percent=40 where id=1");
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(false);
  await db.query("update public.settings set milk_drop_threshold_percent=30 where id=1");
  expect((await dropAlerts()).some((alert) => alert.alert_kind === "milk_drop_morning")).toBe(true);

  for (const value of [4, 81]) {
    await db.exec("savepoint invalid_threshold");
    try {
      await expect(db.query("update public.settings set milk_drop_threshold_percent=$1 where id=1", [value]))
        .rejects.toThrow(/milk_drop_threshold_percent/);
    } finally { await db.exec("rollback to savepoint invalid_threshold; release savepoint invalid_threshold"); }
  }
});
