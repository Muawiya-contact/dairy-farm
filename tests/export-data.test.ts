import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildPdf, buildPdfReport, buildXlsx, columnLabel, DATASETS, displayCell, offspringSummary, toCsv } from "../src/lib/export-data";

beforeAll(() => vi.stubGlobal("fetch", async (url: string) => {
  if (url === "/brand/icon-192.png" || url === "/brand/coding-moves-services.png") {
    return new Response(readFileSync(resolve(`public/brand/${url.split("/").pop()}`)));
  }
  if (url.startsWith("/fonts/pdf/")) {
    return new Response(readFileSync(resolve(`public${url}`)));
  }
  return new Response(null, { status: 404 });
}));
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
    expect(DATASETS.find((dataset) => dataset.table === "expenses")?.columns).toContain("received_by");
    expect(DATASETS.find((dataset) => dataset.table === "month_lock_events")?.columns).toContain("reason");
    expect(toCsv(["month", "action", "reason", "created_at"], [], "Maheena band faislay"))
      .toBe('\uFEFF"Maheena","Faisla","Wajah","Waqt"\r\n');
  });

  it("escapes quotes, line breaks and spreadsheet formulas", () => {
    expect(toCsv(["name", "notes", "amount"], [{ name: '=SUM(1,2)', notes: 'Line 1\n"Line 2"', amount: 0 }]))
      .toBe('\uFEFF"Naam","Notes","Raqam (Rs)"\r\n"\'=SUM(1,2)","Line 1\n""Line 2""","0"\r\n');
  });

  it("labels cash differences as money and serializes audit snapshots", () => {
    expect(columnLabel("difference", "Cash counts")).toBe("Farq (Rs)");
    expect(columnLabel("difference", "Doodh ka khulasa")).toBe("Farq (L)");
    expect(columnLabel("counted_amount")).toContain("Rs");
    expect(columnLabel("khata_amount")).toBe("Khata billed (Rs)");
    expect(columnLabel("company_bill_amount")).toBe("Company bill (Rs)");
    expect(columnLabel("galla_cash_received")).toBe("Cash sale Galla credit (Rs)");
    expect(displayCell({ amount: 10, method: "cash" })).toBe('{"amount":10,"method":"cash"}');
    expect(toCsv(["before_row"], [{ before_row: { amount: 10 } }])).toContain('{""amount"":10}');
  });

  it("exports Inventory Report headings in Roman Urdu", () => {
    expect(columnLabel("opening_stock", "Har samaan ka stock baqaya")).toBe("Shuru ka stock");
    expect(columnLabel("movement_date", "Stock ki harkat")).toBe("Harkat ki tareekh");
    expect(columnLabel("account_name", "Stock ki harkat")).toBe("Galla account");
    expect(toCsv(["opening_stock", "movement_date"], [], "Inventory Report"))
      .toBe('\uFEFF"Shuru ka stock","Harkat ki tareekh"\r\n');
  });

  it("labels breeding due-date provenance in Roman Urdu", () => {
    expect(columnLabel("ultrasound_due_type")).toBe("Ultrasound tareekh ka zariya");
    expect(columnLabel("checkup_due_type")).toBe("Checkup tareekh ka zariya");
    expect(columnLabel("dry_off_due_type")).toBe("Doodh band tareekh ka zariya");
    expect(columnLabel("calving_due_type")).toBe("Paidaish tareekh ka zariya");
  });
});

it("creates branded Excel and embedded-font PDF exports, including an empty table", async () => {
  const columns = ["tag", "name", "amount"];
  const bytes = await buildXlsx("Janwar", columns, [{ tag: "C-1", name: "Bessie", amount: 0 }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  expect(sheet.getRow(1).values).toEqual([undefined, "Tag", "Naam", "Raqam (Rs)"]);
  expect(sheet.getRow(2).values).toEqual([undefined, "C-1", "Bessie", 0]);
  const pdf = await buildPdf("Janwar", columns, [], "Saim Dairy Farm");
  const pdfText = new TextDecoder().decode(pdf);
  expect(pdfText.slice(0, 8)).toBe("%PDF-1.3");
  expect(pdfText).toContain("/Subtype /Image");
  expect(pdfText).toContain("/NotoSans");
  expect(pdfText).toContain("/BricolageGrotesque");
  expect(pdfText).toContain("https://codingmoves.com/?utm_source=dairy-app");
  expect(pdfText).toContain("mailto:contact@codingmoves.com");
  const auditPdf = await buildPdf("Payment audit", ["before_row"], [{ before_row: { amount: 10 } }], "Saim Dairy Farm");
  expect(new TextDecoder().decode(auditPdf)).not.toContain("[object Object]");
});

it("keeps supporting customer and expense rows in a combined period PDF", async () => {
  const pdf = await buildPdfReport("Farm report", [
    { title: "Farm ka khulasa", columns: ["item", "value"], rows: [{ item: "Farm munafa", value: "Rs 500" }] },
    { title: "Customer ka period hisaab", columns: ["name", "charged"], rows: [{ name: "Shoukat", charged: "Rs 1,200" }] },
    { title: "Rozana kharchay", columns: ["expense_date", "amount"], rows: [{ expense_date: "2026-11-15", amount: "Rs 300" }] },
  ], "Saim Dairy Farm");
  const text = new TextDecoder().decode(pdf);
  expect(text).toContain("/NotoSans");
  expect(pdf.byteLength).toBeGreaterThan(100_000);
});

it("repeats row identifiers when a PDF table continues on another horizontal page", async () => {
  const columns = ["report_date", ...Array.from({ length: 60 }, (_, index) => `field_${index}`)];
  const row = Object.fromEntries(columns.map((column) => [column, column === "report_date" ? "DATE-REPEAT-CHECK" : "1"]));
  const pdf = await buildPdfReport("Wide report", [
    { title: "Wide table", columns, rows: [row], repeatColumns: ["report_date"] },
  ], "Saim Dairy Farm");
  const text = new TextDecoder().decode(pdf);
  expect(text).toMatch(/\/Count [2-9][0-9]*/);
});
