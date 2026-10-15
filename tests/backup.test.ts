import { expect, it } from "vitest";
import { buildFarmBackup, verifyFarmBackup } from "../src/lib/backup";

it("builds a counted, checkable all-table snapshot and detects changed rows", async () => {
  const backup = await buildFarmBackup(async (dataset) => dataset.table === "animals" ? [{ id: "a", tag: "QA" }] : []);
  expect(backup.format).toBe("dairy-farm-data-v1");
  expect(backup.row_counts.animals).toBe(1);
  expect(backup.row_counts.expense_audit).toBe(0);
  expect(await verifyFarmBackup(backup)).toBe(true);
  backup.tables.animals[0].tag = "Changed";
  expect(await verifyFarmBackup(backup)).toBe(false);
});

it("never returns a partial snapshot when a table fails", async () => {
  await expect(buildFarmBackup(async (dataset) => {
    if (dataset.table === "customers") throw new Error("network lost");
    return [];
  })).rejects.toThrow("network lost");
});
