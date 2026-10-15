import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildPdf, buildXlsx, columnLabel, DATASETS, displayCell, offspringSummary, toCsv } from "../src/lib/export-data";

beforeAll(() => vi.stubGlobal("fetch", async (url: string) =>
  url === "/brand/icon-192.png"
    ? new Response(readFileSync(resolve("public/brand/icon-192.png")))
    : new Response(null, { status: 404 })
));
afterAll(() => vi.unstubAllGlobals());

describe("CSV exports", () => {
  it("exports the current calf tag and retains its birth tag, sex, weight and note", () => {
    const animals = new Map<unknown, Record<string, unknown>>([["calf-1", { tag: "NEW-17" }]]);
    const summary = offspringSummary([
      { birth_order: 1, outcome: "alive", animal_id: "calf-1", tag_at_birth: "TEMP-123", sex: "female", birth_weight_kg: 32.5, notes: "Healthy" },
      { birth_order: 2, outcome: "stillborn", animal_id: null, tag_at_birth: null, sex: "male", birth_weight_kg: 21, notes: "Vet informed" },
    ], animals);
    expect(summary).toContain("Tag: NEW-17 (paidaish: TEMP-123)");
    expect(summary).toContain("Mada");
    expect(summary).toContain("32.5 kg");
    expect(summary).toContain("2: Paidaish par wafat · Nar · 21 kg · Vet informed");
  });
  it("keeps labelled columns in an empty production table", () => {
    expect(toCsv(DATASETS[0].columns.slice(0, 3), [])).toBe('\uFEFF"ID","Tag","Naam"\r\n');
    expect(DATASETS.find((dataset) => dataset.table === "settings")?.columns).toContain("contact_phone");
    expect(DATASETS.find((dataset) => dataset.table === "salary_periods")?.columns).toContain("agreed_amount");
    expect(DATASETS.find((dataset) => dataset.table === "expenses")?.columns).toContain("salary_period_id");
  });

  it("escapes quotes, line breaks and spreadsheet formulas", () => {
    expect(toCsv(["name", "notes", "amount"], [{ name: '=SUM(1,2)', notes: 'Line 1\n"Line 2"', amount: 0 }]))
      .toBe('\uFEFF"Naam","Notes","Raqam (Rs)"\r\n"\'=SUM(1,2)","Line 1\n""Line 2""","0"\r\n');
  });

  it("labels cash differences as money and serializes audit snapshots", () => {
    expect(columnLabel("difference", "Cash counts")).toBe("Farq (Rs)");
    expect(columnLabel("difference", "Doodh ka khulasa")).toBe("Farq (L)");
    expect(columnLabel("counted_amount")).toContain("Rs");
    expect(displayCell({ amount: 10, method: "cash" })).toBe('{"amount":10,"method":"cash"}');
    expect(toCsv(["before_row"], [{ before_row: { amount: 10 } }])).toContain('{""amount"":10}');
  });
});

it("creates readable Excel and PDF exports, including an empty-table header", async () => {
  const columns = ["tag", "name", "amount"];
  const bytes = await buildXlsx("Janwar", columns, [{ tag: "C-1", name: "Bessie", amount: 0 }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  expect(sheet.getRow(1).values).toEqual([undefined, "Tag", "Naam", "Raqam (Rs)"]);
  expect(sheet.getRow(2).values).toEqual([undefined, "C-1", "Bessie", 0]);
  const pdf = await buildPdf("Janwar", columns, [], "Saim Dairy Farm");
  expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.3");
  expect(new TextDecoder().decode(pdf)).toContain("/Subtype /Image");
  expect(new TextDecoder().decode(pdf)).toContain("Saim Dairy Farm");
  const auditPdf = await buildPdf("Payment audit", ["before_row"], [{ before_row: { amount: 10 } }], "Saim Dairy Farm");
  expect(new TextDecoder().decode(auditPdf)).not.toContain("[object Object]");
});
