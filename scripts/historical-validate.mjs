import { createHash } from "node:crypto";
import { basename } from "node:path";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const digest = (value) => sha256(JSON.stringify(stable(value)));

export function sameAsBackup(actual, expected) {
  if (expected === null || actual === null) return actual === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expected) && actual instanceof Date) {
    return actual.toISOString().slice(0, 10) === expected;
  }
  if (typeof expected === "string" && /^\d{4}-\d{2}-\d{2}T/.test(expected)) {
    return (actual instanceof Date ? actual.getTime() : Date.parse(String(actual))) === Date.parse(expected);
  }
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length &&
    expected.every((item, index) => sameAsBackup(actual[index], item));
  if (typeof expected === "object") return typeof actual === "object" && !Array.isArray(actual) &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.keys(expected).every((key) => Object.hasOwn(actual, key) && sameAsBackup(actual[key], expected[key]));
  return actual === expected;
}

export function validateArchive(archive, target) {
  if (archive.format !== "dairy-historical-archive-v1" || !Array.isArray(archive.rows)) throw new Error("Unknown archive format");
  if (target === "staging" && archive.source !== "fictional") throw new Error("Staging accepts fictional rows only");
  if (target === "production" && archive.source !== "real") throw new Error("Production accepts real source rows only");
  const keys = new Set();
  const sourceHashes = new Map();
  const validKind = new Set(["milk_day", "expense_day", "customer_month", "breeding", "animal_event"]);
  const amountFields = ["litres", "charged_rs", "paid_rs", "farm_debit_rs", "home_debit_rs", "daily_credit_rs"];
  for (const row of archive.rows) {
    if (!validKind.has(row.kind) || !/^[0-9a-f]{64}$/.test(row.source_key) || !/^[0-9a-f]{64}$/.test(row.row_sha256)) throw new Error("Invalid archive row");
    if (keys.has(row.source_key)) throw new Error("Duplicate source key in file");
    keys.add(row.source_key);
    const expectedKey = sha256([row.kind, row.source_workbook, row.source_sheet, row.source_cell].join("|"));
    if (row.source_key !== expectedKey) throw new Error("Source key does not match source cell");
    const canonical = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "source_key" && key !== "row_sha256"));
    if (row.row_sha256 !== digest(canonical)) throw new Error("Archive row digest mismatch");
    if (row.source_workbook !== basename(row.source_workbook) || !/^[0-9a-f]{64}$/.test(row.source_file_sha256)) throw new Error("Invalid source filename or digest");
    const prior = sourceHashes.get(row.source_workbook);
    if (prior && prior !== row.source_file_sha256) throw new Error("Conflicting source workbook digests");
    sourceHashes.set(row.source_workbook, row.source_file_sha256);
    if (["milk_day", "expense_day", "customer_month"].includes(row.kind) && !/^\d{4}-\d{2}-\d{2}$/.test(row.record_date)) throw new Error("Dated archive row lacks a date");
    for (const field of amountFields) {
      const value = row[field];
      if (value != null && value !== "" && (!/^\d+(?:\.\d{1,2})?$/.test(String(value)) || Number(value) < 0)) throw new Error(`Invalid ${field}`);
    }
    if (target === "staging" && row.details?.demo !== true) throw new Error("Staging row is not wholly fictional");
    if (target === "staging" && row.canonical_label) throw new Error("Real customer mapping in staging archive");
    if (target === "production" && row.details?.demo === true) throw new Error("Demo row in production archive");
  }
  return { keys, sourceHashes };
}
