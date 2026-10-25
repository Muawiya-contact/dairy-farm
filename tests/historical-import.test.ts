import { expect, test } from "vitest";
import { pgDateKey, sha256, sameAsBackup, validateArchive } from "../scripts/historical-validate.mjs";

const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;

function fictionalArchive() {
  const row: Record<string, unknown> = {
    kind: "milk_day", record_date: "2026-09-30", source_label: "Demo customer",
    canonical_label: null, source_workbook: "demo-history.xlsx", source_sheet: "Fictional",
    source_cell: "A2", source_file_sha256: sha256("fictional demo only"),
    litres: "7.00", charged_rs: "980.00", paid_rs: "", details: { demo: true }, flags: [],
  };
  row.source_key = sha256("milk_day|demo-history.xlsx|Fictional|A2");
  row.row_sha256 = sha256(JSON.stringify(stable(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "source_key")))));
  return { format: "dairy-historical-archive-v1", source: "fictional", rows: [row] };
}

test("fictional archive validates, and real source is rejected on staging", () => {
  const archive = fictionalArchive();
  expect(validateArchive(archive, "staging").keys.size).toBe(1);
  expect(() => validateArchive({ ...archive, source: "real" }, "staging")).toThrow(/fictional rows only/);
  expect(() => validateArchive(archive, "production")).toThrow(/real source rows only/);
});

test("archive importer rejects changed source content and duplicate keys", () => {
  const archive = fictionalArchive();
  const tampered = structuredClone(archive);
  tampered.rows[0].charged_rs = "999.00";
  expect(() => validateArchive(tampered, "staging")).toThrow(/digest mismatch/);
  const duplicate = fictionalArchive();
  duplicate.rows.push(structuredClone(duplicate.rows[0]));
  expect(() => validateArchive(duplicate, "staging")).toThrow(/Duplicate source key/);
});

test("backup comparison handles PostgreSQL numerics, dates and precise timestamps", () => {
  expect(sameAsBackup({ amount: "1250.00", opened: new Date("2026-10-23T00:00:00Z"),
    changed: new Date("2026-10-25T11:14:32.208Z") },
  { amount: 1250, opened: "2026-10-23", changed: "2026-10-25T11:14:32.208+00:00" })).toBe(true);
  expect(sameAsBackup({ amount: "1251.00" }, { amount: 1250 })).toBe(false);
});

test("PostgreSQL calendar dates use local day, including month-lock keys", () => {
  const date = new Date(2026, 9, 23); // node-postgres DATE parser uses local midnight
  expect(pgDateKey(date)).toBe("2026-10-23");
  expect(sameAsBackup({ opening_date: date }, { opening_date: "2026-10-23" })).toBe(true);
  expect(sameAsBackup({ opening_date: date }, { opening_date: "2026-10-24" })).toBe(false);
});
