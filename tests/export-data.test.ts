import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPdf, buildXlsx, DATASETS, toCsv } from "../src/lib/export-data";

describe("CSV exports", () => {
  it("keeps labelled columns in an empty production table", () => {
    expect(toCsv(DATASETS[0].columns.slice(0, 3), [])).toBe('\uFEFF"ID","Tag","Naam"\r\n');
  });

  it("escapes quotes, line breaks and spreadsheet formulas", () => {
    expect(toCsv(["name", "notes", "amount"], [{ name: '=SUM(1,2)', notes: 'Line 1\n"Line 2"', amount: 0 }]))
      .toBe('\uFEFF"Naam","Notes","Raqam (Rs)"\r\n"\'=SUM(1,2)","Line 1\n""Line 2""","0"\r\n');
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
  const pdf = await buildPdf("Janwar", columns, []);
  expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.3");
});
