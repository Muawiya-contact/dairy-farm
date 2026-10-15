import { describe, expect, test } from "vitest";
import { IMPORT_TEMPLATES, parseCsv, previewImport } from "../src/lib/import-preview";

const today = "2026-10-15";

describe("import dry run", () => {
  test("parses quoted CSV with line breaks and preserves blank-record row offsets", () => {
    const matrix = parseCsv(`\uFEFF${IMPORT_TEMPLATES.animals.join(",")}\r\n` +
      `A-1,"First, cow",cow,Holstein,female,cow,2026-01-01,2024-01-01,,purchased,"Line 1\nLine 2"\r\n` +
      `\r\nA-1,Second,cow,,female,cow,2026-01-01,,,purchased,\r\n`);
    const result = previewImport(matrix, "animals", today);
    expect(result.count).toBe(2);
    expect(result.rows[0].name).toBe("First, cow");
    expect(result.rows[0].notes).toBe("Line 1\nLine 2");
    expect(result.issues).toContainEqual({ row: 4, message: "Is file mein tag ya naam dobara aaya hai." });
  });

  test("rejects malformed CSV and mismatched templates", () => {
    expect(() => parseCsv('name\n"unfinished')).toThrow(/quote band/);
    expect(() => parseCsv('name\n"value"extra')).toThrow(/extra text/);
    expect(() => previewImport([["name"]], "accounts", today)).toThrow(/Column names/);
  });

  test("checks signed opening balances and customer business rules", () => {
    const valid = ["Ahmed", "03297316882", "regular", "2026-01-01", "1.25", "0", "150", "-100.50", ""];
    const invalid = ["Free", "", "free", "2026-11-01", "-1", "0", "10", "100", ""];
    const duplicate = ["ahmed", "", "regular", "2026-01-01", "1", "0", "150", "0", ""];
    const result = previewImport([[...IMPORT_TEMPLATES.customers], valid, invalid, duplicate], "customers", today);
    expect(result.count).toBe(3);
    expect(result.issues.filter((issue) => issue.row === 2)).toEqual([]);
    expect(result.issues.filter((issue) => issue.row === 3).map((issue) => issue.message).join(" "))
      .toMatch(/aaj se aage|Morning litres|rate 0|opening balance 0|Free reason/);
    expect(result.issues).toContainEqual({ row: 4, message: "Is file mein tag ya naam dobara aaya hai." });
  });

  test("rejects impossible dates, oversized ages, and duplicate account names", () => {
    const accounts = previewImport([[...IMPORT_TEMPLATES.accounts],
      ["Farm bank", "bank", "2026-02-30", "0"],
      ["farm BANK", "bank", "2026-01-01", "-250"]], "accounts", today);
    expect(accounts.issues).toContainEqual({ row: 2, message: "Opening date: YYYY-MM-DD tareekh likhein." });
    expect(accounts.issues).toContainEqual({ row: 3, message: "Is file mein tag ya naam dobara aaya hai." });
    const animal = previewImport([[...IMPORT_TEMPLATES.animals],
      ["A", "", "cow", "", "female", "cow", "2026-01-01", "", "601", "purchased", ""]], "animals", today);
    expect(animal.issues.some((issue) => issue.message.includes("600"))).toBe(true);
  });
});
