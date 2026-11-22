import { addDays, daysBetween, formatDay, monthStart } from "./dates";
import type { InventoryReportSummary, InventoryReportTransaction, InventoryReportUsage } from "./farm-inventory";
import { columnLabel, type PdfSection } from "./export-data";

export type InventoryReportPreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
export const inventoryReportMovementLabel = (type: string) => ({
  opening: "Ibtidai stock", purchase: "Naya stock / kharid", usage: "Istemaal / diya",
  adjustment: "Stock mein tabdeeli", wastage: "Zaya stock",
}[type] ?? type);

export const INVENTORY_REPORT_SECTIONS = {
  details: "Report ki tafseel",
  balances: "Har samaan ka stock baqaya",
  usage: "Mulazim ke mutabiq istemal",
  movements: "Stock ki harkat",
} as const;

export const INVENTORY_REPORT_SUMMARY_COLUMNS = [
  "item_name", "category_name", "stock_unit", "opening_stock", "opening_entries_in", "purchases_in",
  "usage_out", "adjustment_in", "adjustment_out", "wastage_out", "closing_stock", "purchase_amount",
  "current_stock", "current_status",
];
export const INVENTORY_REPORT_USAGE_COLUMNS = [
  "item_name", "category_name", "staff_name", "total_quantity", "stock_unit", "transaction_count",
];
export const INVENTORY_REPORT_TRANSACTION_COLUMNS = [
  "movement_date", "movement_type", "item_name", "category_name", "entered_quantity", "entered_unit",
  "quantity_delta", "stock_unit", "running_balance_after", "staff_name", "unit_rate", "total_amount",
  "account_name", "expense_id", "supplier", "reference", "batch_code", "expiry_date", "purpose", "reason",
  "note", "actor_id",
];

export type InventoryReportExportContext = {
  from: string;
  to: string;
  filters: string[];
  balanceScope: string;
};

export function inventoryReportExportSections(
  summary: InventoryReportSummary[], usage: InventoryReportUsage[], transactions: InventoryReportTransaction[],
  context?: InventoryReportExportContext,
): PdfSection[] {
  return [
    ...(context ? [{ title: INVENTORY_REPORT_SECTIONS.details, columns: ["detail", "value"], rows: [
      { detail: "Report ki muddat", value: `${context.from} se ${context.to} tak, dono tareekhein shamil` },
      { detail: "Chhantne ke options", value: context.filters.length ? context.filters.join(" · ") : "Koi option nahin chuna" },
      { detail: "Stock ka daaira", value: context.balanceScope },
      { detail: "Istemaal ki qeemat", value: "Qeemat nahin nikali gayi kyun ke stock dete waqt bharosemand qeemat record nahin hoti." },
    ] }] : []),
    { title: INVENTORY_REPORT_SECTIONS.balances, columns: INVENTORY_REPORT_SUMMARY_COLUMNS, repeatColumns: ["item_name"],
      rows: summary.map((row) => ({ ...row, current_status: row.current_out_of_stock ? "Stock khatam" : row.current_low_stock ? "Stock kam" : "Stock mojood" })) },
    { title: INVENTORY_REPORT_SECTIONS.usage, columns: INVENTORY_REPORT_USAGE_COLUMNS,
      rows: usage.map((row) => ({ ...row, staff_name: row.staff_name ?? "Farm ka aam istemal (mulazim ke baghair)" })) },
    { title: INVENTORY_REPORT_SECTIONS.movements, columns: INVENTORY_REPORT_TRANSACTION_COLUMNS,
      repeatColumns: ["movement_date", "movement_type", "item_name"],
      rows: transactions.map((row) => ({ ...row, movement_type: inventoryReportMovementLabel(row.movement_type),
        staff_name: row.staff_name ?? (row.movement_type === "usage" ? "Farm ka aam istemal (mulazim ke baghair)" : "—") })) },
  ];
}

export async function buildInventoryReportWorkbook(
  summary: InventoryReportSummary[], usage: InventoryReportUsage[], transactions: InventoryReportTransaction[],
  context?: InventoryReportExportContext,
): Promise<Uint8Array<ArrayBuffer>> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sections = inventoryReportExportSections(summary, usage, transactions, context);
  const sheets = [
    ...(context ? [{ name: INVENTORY_REPORT_SECTIONS.details, columns: ["detail", "value"], rows: sections[0].rows }] : []),
    { name: INVENTORY_REPORT_SECTIONS.balances, columns: INVENTORY_REPORT_SUMMARY_COLUMNS, rows: sections.find((section) => section.title === INVENTORY_REPORT_SECTIONS.balances)!.rows },
    { name: INVENTORY_REPORT_SECTIONS.usage, columns: INVENTORY_REPORT_USAGE_COLUMNS, rows: sections.find((section) => section.title === INVENTORY_REPORT_SECTIONS.usage)!.rows },
    { name: INVENTORY_REPORT_SECTIONS.movements, columns: INVENTORY_REPORT_TRANSACTION_COLUMNS, rows: sections.find((section) => section.title === INVENTORY_REPORT_SECTIONS.movements)!.rows },
  ];
  for (const entry of sheets) {
    const sheet = workbook.addWorksheet(entry.name);
    sheet.addRow(entry.columns.map((column) => columnLabel(column, entry.name)));
    for (const row of entry.rows) sheet.addRow(entry.columns.map((column) => row[column] ?? ""));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: entry.rows.length + 1, column: entry.columns.length } };
    entry.columns.forEach((column, index) => { sheet.getColumn(index + 1).width = Math.min(34, Math.max(14, columnLabel(column, entry.name).length + 3)); });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer);
}

export function isInventoryReportDateRange(from: string, to: string, today: string): boolean {
  try {
    formatDay(from); formatDay(to); formatDay(today);
    return from <= to && to <= today && daysBetween(from, to) <= 3660;
  } catch { return false; }
}

export function inventoryReportMonthRange(today: string): { from: string; to: string } {
  try { formatDay(today); return { from: monthStart(today), to: today }; }
  catch { return { from: "", to: "" }; }
}

export function inventoryReportYearRange(today: string): { from: string; to: string } {
  try { formatDay(today); return { from: `${today.slice(0, 4)}-01-01`, to: today }; }
  catch { return { from: "", to: "" }; }
}

export function inventoryReportRange(preset: InventoryReportPreset, today: string): { from: string; to: string } {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "week") return { from: addDays(today, -6), to: today };
  if (preset === "month") return inventoryReportMonthRange(today);
  if (preset === "year") return inventoryReportYearRange(today);
  return inventoryReportMonthRange(today);
}
