import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPdf, buildXlsx, columnLabel, DATASETS, displayCell, toCsv } from "../src/lib/export-data";

describe("CSV exports", () => {
  it("keeps labelled columns in an empty production table", () => {
    expect(toCsv(DATASETS[0].columns.slice(0, 3), [])).toBe('\uFEFF"ID","Tag","Naam"\r\n');
    expect(DATASETS.find((dataset) => dataset.table === "settings")?.columns).toContain("contact_phone");
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
  const pdf = await buildPdf("Janwar", columns, []);
  expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.3");
  const auditPdf = await buildPdf("Payment audit", ["before_row"], [{ before_row: { amount: 10 } }]);
  expect(new TextDecoder().decode(auditPdf)).not.toContain("[object Object]");
});
