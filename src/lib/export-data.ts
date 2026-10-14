import { getSupabase } from "./supabase";
import type { Database } from "./database.types";

type Table = keyof Database["public"]["Tables"];

export const DATASETS: { table: Table; label: string; key: string; columns: string[] }[] = [
  { table: "animals", label: "Janwar", key: "id", columns: ["id", "tag", "name", "species", "breed", "sex", "category", "birth_date", "mother_id", "sire", "source", "purchase_date", "purchase_price", "milking_status", "life_status", "exit_date", "exit_reason", "sale_price", "notes", "created_at", "updated_at"] },
  { table: "inseminations", label: "Nasl kashi", key: "id", columns: ["id", "animal_id", "service_date", "semen_type", "semen_name", "technician", "ultrasound_due", "ultrasound_date", "ultrasound_result", "checkup_due", "checkup_date", "checkup_result", "dry_off_due", "dry_off_date", "calving_due", "status", "abortion_date", "notes", "created_at", "updated_at"] },
  { table: "calvings", label: "Bachay ki paidaish", key: "id", columns: ["id", "animal_id", "calving_date", "insemination_id", "outcome", "calf_id", "notes", "created_at"] },
  { table: "health_events", label: "Sehat", key: "id", columns: ["id", "animal_id", "event_date", "kind", "title", "medicine", "vet", "cost", "next_due_date", "expense_id", "notes", "created_at"] },
  { table: "milk_shifts", label: "Doodh ki shifts", key: "id", columns: ["id", "milk_date", "shift", "total_litres", "mode", "notes", "created_at", "updated_at"] },
  { table: "animal_milk", label: "Har janwar ka doodh", key: "id", columns: ["id", "shift_id", "animal_id", "litres"] },
  { table: "milk_deliveries", label: "Doodh ki delivery", key: "id", columns: ["id", "delivery_date", "shift", "customer_id", "litres", "rate", "amount", "created_at"] },
  { table: "customers", label: "Customers", key: "id", columns: ["id", "name", "phone", "kind", "free_reason", "default_morning", "default_evening", "opening_balance", "opening_date", "active", "sort_order", "notes", "created_at"] },
  { table: "customer_rates", label: "Doodh ke rate", key: "id", columns: ["id", "customer_id", "rate", "effective_from"] },
  { table: "company_bills", label: "Company bills", key: "id", columns: ["id", "customer_id", "from_date", "to_date", "litres", "amount", "notes", "created_at"] },
  { table: "payments", label: "Wusooli", key: "id", columns: ["id", "customer_id", "payment_date", "amount", "kind", "method", "account_id", "delivery_id", "note", "created_at"] },
  { table: "expenses", label: "Kharchay", key: "id", columns: ["id", "expense_date", "category_id", "amount", "account_id", "staff_id", "quantity", "unit", "note", "created_at"] },
  { table: "expense_categories", label: "Kharchay ki qisamain", key: "id", columns: ["id", "name", "is_farm_cost", "is_salary", "active", "sort_order"] },
  { table: "other_income", label: "Doosri aamdani", key: "id", columns: ["id", "income_date", "kind", "amount", "account_id", "animal_id", "note", "created_at"] },
  { table: "transfers", label: "Account transfer", key: "id", columns: ["id", "transfer_date", "from_account_id", "to_account_id", "amount", "note", "created_at"] },
  { table: "accounts", label: "Accounts", key: "id", columns: ["id", "name", "kind", "is_farm_cash", "opening_balance", "opening_date", "active", "sort_order", "created_at"] },
  { table: "staff", label: "Staff", key: "id", columns: ["id", "name", "role", "monthly_salary", "phone", "active", "created_at"] },
  { table: "month_locks", label: "Band maheenay", key: "month", columns: ["month", "locked_at", "note"] },
  { table: "settings", label: "Farm settings", key: "id", columns: ["id", "farm_name", "owner_name", "contact_phone", "go_live_date", "default_milk_rate", "ultrasound_days", "checkup_days", "dry_off_days", "calving_days", "fresh_days", "whatsapp_footer"] },
];

export const REPORTS = [
  { name: "customer_month_report", label: "Customer ka maheena", columns: ["name", "kind", "litres", "amount", "previous_balance", "total", "paid", "discount", "balance"] },
  { name: "expense_month_report", label: "Maheene ke kharchay", columns: ["label", "category", "staff_name", "is_farm_cost", "amount"] },
  { name: "milk_month_summary", label: "Doodh ka khulasa", columns: ["produced", "sold_litres", "free_litres", "delivered", "difference", "company_slip_litres"] },
  { name: "pnl_month", label: "Aamdani aur kharcha", columns: ["milk_income", "other_income", "total_income", "farm_expenses", "personal_expenses", "profit"] },
] as const;

export const BREEDING_COLUMNS = ["tag", "name", "service_date", "semen_type", "semen_name", "technician", "ultrasound_date", "ultrasound_result", "checkup_date", "checkup_result", "dry_off_date", "dry_off_due", "calving_due", "calving_date", "status", "abortion_date", "notes"];

const COLUMN_LABELS: Record<string, string> = {
  id: "ID", tag: "Tag", name: "Naam", animal_id: "Janwar ID", customer_id: "Customer ID",
  service_date: "Tukhm rezi ki tareekh", semen_type: "Semen qism", semen_name: "Semen naam",
  checkup_due: "Checkup ki mutawaqqa tareekh", checkup_date: "Checkup ki tareekh",
  dry_off_due: "Khushk hone ki mutawaqqa tareekh", dry_off_date: "Asal khushk hone ki tareekh", calving_due: "Bachay ki mutawaqqa tareekh",
  calving_date: "Bachay ki paidaish ki tareekh", ultrasound_date: "Ultrasound ki tareekh",
  ultrasound_due: "Ultrasound ki mutawaqqa tareekh", ultrasound_result: "Ultrasound ka nateeja",
  checkup_result: "Checkup ka nateeja", abortion_date: "Hamla zaya ki tareekh",
  status: "Haalat", notes: "Notes", note: "Note", milk_date: "Doodh ki tareekh",
  delivery_date: "Delivery ki tareekh", litres: "Doodh (L)", total_litres: "Kul doodh (L)",
  amount: "Raqam (Rs)", cost: "Kharcha (Rs)", purchase_price: "Kharid qeemat (Rs)",
  sale_price: "Farokht qeemat (Rs)", exit_date: "Ikhtitam ki tareekh",
  exit_reason: "Ikhtitam ki wajah", birth_date: "Paidaish ki tareekh", breed: "Nasl",
  sex: "Jins", category: "Umar ka group", species: "Janwar ki qism",
  previous_balance: "Pichla baqaya (Rs)", total: "Kul raqam (Rs)", paid: "Ada shuda (Rs)",
  discount: "Riayat (Rs)", balance: "Baqaya (Rs)", label: "Tafseel",
  produced: "Paida hua doodh (L)", sold_litres: "Bikne wala doodh (L)",
  free_litres: "Muft doodh (L)", delivered: "Diya gaya doodh (L)",
  difference: "Farq (L)", company_slip_litres: "Company parchi doodh (L)",
  milk_income: "Doodh ki aamdani (Rs)", other_income: "Doosri aamdani (Rs)",
  total_income: "Kul aamdani (Rs)", farm_expenses: "Farm kharchay (Rs)",
  personal_expenses: "Zaati kharchay (Rs)", profit: "Munafa ya nuqsan (Rs)",
  staff_name: "Mulazim ka naam", is_farm_cost: "Farm ka kharcha",
  technician: "Technician", sort_order: "Tarteeb", kind: "Qism",
  contact_phone: "Farm contact number",
};

export const columnLabel = (column: string) => COLUMN_LABELS[column] ?? column.replaceAll("_", " ");

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet software treats these prefixes as formulas, even inside quoted CSV cells.
  const safe = typeof value === "string" && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return "\uFEFF" + [columns.map((column) => csvCell(columnLabel(column))).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n";
}

export async function fetchDataset(dataset: (typeof DATASETS)[number]): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from(dataset.table).select("*").order(dataset.key).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}

export async function fetchReport(name: (typeof REPORTS)[number]["name"], month: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().rpc(name, { p_month: `${month}-01` });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function fetchBreedingRegister(): Promise<Record<string, unknown>[]> {
  const animalTable = DATASETS.find((item) => item.table === "animals")!;
  const breedingTable = DATASETS.find((item) => item.table === "inseminations")!;
  const calvingTable = DATASETS.find((item) => item.table === "calvings")!;
  const [animals, breedings, calvings] = await Promise.all([
    fetchDataset(animalTable), fetchDataset(breedingTable), fetchDataset(calvingTable),
  ]);
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const calvingByBreeding = new Map(calvings.map((calving) => [calving.insemination_id, calving]));
  return breedings.map((breeding) => {
    const animal = animalById.get(breeding.animal_id);
    const calving = calvingByBreeding.get(breeding.id);
    return { ...breeding, tag: animal?.tag ?? "", name: animal?.name ?? "", calving_date: calving?.calving_date ?? null };
  });
}

export function downloadFile(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

export async function buildXlsx(title: string, columns: string[], rows: Record<string, unknown>[]): Promise<Uint8Array<ArrayBuffer>> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[\\/?*\[\]:]/g, " "));
  sheet.addRow(columns.map(columnLabel));
  for (const row of rows) sheet.addRow(columns.map((column) => row[column] == null ? "" : typeof row[column] === "object" ? JSON.stringify(row[column]) : row[column]));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = Math.min(35, Math.max(14, columnLabel(column).length + 3)); });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayBuffer);
}

export async function buildPdf(title: string, columns: string[], rows: Record<string, unknown>[]): Promise<Uint8Array<ArrayBuffer>> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  pdf.setFontSize(16);
  pdf.text(title, 10, 13);
  pdf.setFontSize(9);
  pdf.text(`${rows.length} entries`, 10, 19);
  autoTable(pdf, {
    startY: 23, head: [columns.map(columnLabel)],
    body: rows.map((row) => columns.map((column) => row[column] == null ? "" : String(row[column]))),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [45, 106, 57] },
    horizontalPageBreak: true, horizontalPageBreakRepeat: 0,
    margin: 10,
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function exportRows(filename: string, title: string, columns: string[], rows: Record<string, unknown>[], format: ExportFormat): Promise<void> {
  if (format === "csv") {
    downloadFile(`${filename}.csv`, toCsv(columns, rows), "text/csv;charset=utf-8");
  } else if (format === "xlsx") {
    downloadBlob(`${filename}.xlsx`, new Blob([await buildXlsx(title, columns, rows)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  } else {
    downloadBlob(`${filename}.pdf`, new Blob([await buildPdf(title, columns, rows)], { type: "application/pdf" }));
  }
}
