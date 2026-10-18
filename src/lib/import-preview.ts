import { addDays } from "./dates";
import { parseAmount, parseSignedAmount } from "./format";
import { normalizePhone } from "./phone";

export const IMPORT_TEMPLATES = {
  animals: ["tag", "name", "species", "breed", "sex", "category", "arrival_date", "birth_date", "estimated_age_months_at_arrival", "source", "notes"],
  customers: ["name", "phone", "kind", "opening_date", "default_morning", "default_noon", "default_evening", "rate", "opening_balance", "free_reason"],
  accounts: ["name", "kind", "opening_date", "opening_balance"],
} as const;
export type ImportKind = keyof typeof IMPORT_TEMPLATES;
export type ImportIssue = { row: number; message: string };
export type ImportPreview = { count: number; issues: ImportIssue[]; rows: Record<string, string>[] };

export function parseCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new RangeError("File 2 MB se chhoti rakhein.");
  const matrix: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, afterQuote = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else cell += ch;
    } else if (afterQuote) {
      if (ch === ",") { row.push(cell); cell = ""; afterQuote = false; }
      else if (ch === "\n" || ch === "\r") {
        row.push(cell); matrix.push(row); row = []; cell = ""; afterQuote = false;
        if (ch === "\r" && source[i + 1] === "\n") i++;
      } else if (ch !== " " && ch !== "\t") throw new RangeError("CSV mein quote ke baad extra text hai.");
    } else if (ch === '"') {
      if (cell) throw new RangeError("CSV mein quote ki jagah sahi nahi.");
      quoted = true;
    } else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      row.push(cell); matrix.push(row); row = []; cell = "";
      if (ch === "\r" && source[i + 1] === "\n") i++;
    } else cell += ch;
  }
  if (quoted) throw new RangeError("CSV ka quote band nahi hua.");
  if (afterQuote || row.length || cell) { row.push(cell); matrix.push(row); }
  return matrix;
}

function date(value: string, today: string, label: string, issues: string[], required = true): void {
  if (!value && !required) return;
  try { addDays(value, 0); }
  catch { issues.push(`${label}: YYYY-MM-DD tareekh likhein.`); return; }
  if (value > today) issues.push(`${label}: aaj se aage nahi ho sakti.`);
}

function amount(value: string, label: string, issues: string[], options: { signed?: boolean; max?: number; positive?: boolean } = {}): number {
  const raw = value || "0";
  try {
    const parsed = options.signed ? parseSignedAmount(raw) : parseAmount(raw);
    if (Math.abs(parsed) > (options.max ?? 9_999_999_999.99) || options.positive && parsed <= 0) throw new RangeError();
    return parsed;
  } catch { issues.push(`${label}: 2 decimal tak sahi raqam likhein.`); return 0; }
}

function validateRow(kind: ImportKind, row: Record<string, string>, today: string): string[] {
  const issues: string[] = [];
  if (kind === "animals") {
    if (!row.tag) issues.push("Janwar ka tag likhein.");
    if (!["cow", "buffalo"].includes(row.species)) issues.push("Species cow ya buffalo honi chahiye.");
    if (!["female", "male"].includes(row.sex)) issues.push("Sex female ya male honi chahiye.");
    if (!["cow", "heifer", "calf", "bull"].includes(row.category)) issues.push("Category cow, heifer, calf ya bull honi chahiye.");
    if (!["born", "purchased", "gift", "transfer", "other"].includes(row.source)) issues.push("Source born, purchased, gift, transfer ya other honi chahiye.");
    date(row.arrival_date, today, "Arrival date", issues);
    date(row.birth_date, today, "Birth date", issues, false);
    if (row.birth_date && row.arrival_date && row.birth_date > row.arrival_date) issues.push("Birth date arrival date se baad nahi ho sakti.");
    if (row.source === "born" && row.birth_date !== row.arrival_date) issues.push("Farm par paida janwar ki birth aur arrival date aik honi chahiye.");
    if (row.birth_date && row.estimated_age_months_at_arrival) issues.push("Birth date aur estimated age aik saath nahi likh sakte.");
    if (row.estimated_age_months_at_arrival && (!/^\d+$/.test(row.estimated_age_months_at_arrival) || Number(row.estimated_age_months_at_arrival) > 600)) issues.push("Estimated age 0 se 600 poore maheene honi chahiye.");
  } else if (kind === "customers") {
    if (!row.name) issues.push("Customer ka naam likhein.");
    if (!["regular", "contractor", "company", "cash", "free"].includes(row.kind)) issues.push("Customer kind sahi chunein.");
    date(row.opening_date, today, "Opening date", issues);
    try { normalizePhone(row.phone); } catch { issues.push("Phone number sahi likhein."); }
    amount(row.default_morning, "Morning litres", issues, { max: 5000 });
    amount(row.default_noon, "Dopehr litres", issues, { max: 5000 });
    amount(row.default_evening, "Evening litres", issues, { max: 5000 });
    const freeOrCompany = row.kind === "free" || row.kind === "company";
    const rate = amount(row.rate, "Rate", issues, { max: 99_999_999.99 });
    if (freeOrCompany && rate !== 0) issues.push("Free aur company customer ka rate 0 rakhein.");
    if (!freeOrCompany && rate <= 0) issues.push("Is customer ka positive rate likhein.");
    const opening = amount(row.opening_balance, "Opening balance", issues, { signed: true });
    if ((row.kind === "cash" || row.kind === "free") && opening !== 0) issues.push("Cash aur free customer ka opening balance 0 rakhein.");
    if (row.kind === "free" && !["owner", "staff", "charity", "calves", "other"].includes(row.free_reason)) issues.push("Free reason chunein.");
    if (row.kind !== "free" && row.free_reason) issues.push("Free reason sirf free customer ke liye hai.");
  } else {
    if (!row.name) issues.push("Account ka naam likhein.");
    if (!["cash", "bank", "person"].includes(row.kind)) issues.push("Account kind cash, bank ya person honi chahiye.");
    date(row.opening_date, today, "Opening date", issues);
    amount(row.opening_balance, "Opening balance", issues, { signed: true });
  }
  return issues;
}

export function previewImport(matrix: string[][], kind: ImportKind, today: string): ImportPreview {
  const columns = [...IMPORT_TEMPLATES[kind]];
  const [header = [], ...body] = matrix;
  const actual = header.map((cell) => {
    const value = cell.trim().toLowerCase();
    return kind === "customers" && ["dopehr", "dopahar", "noon"].includes(value) ? "default_noon" : value;
  });
  const legacy = kind === "customers" && actual.join("|") === columns.filter((column) => column !== "default_noon").join("|");
  if (!legacy && actual.join("|") !== columns.join("|")) {
    throw new RangeError("Column names aur tartib template se milni chahiye.");
  }
  const filled = body.map((cells, index) => ({ cells, line: index + 2 })).filter(({ cells }) => cells.some((cell) => cell.trim()));
  if (filled.length > 5000) throw new RangeError("Aik file mein 5000 se zyada rows na rakhein.");
  const rows: Record<string, string>[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const { cells, line } of filled) {
    const row = Object.fromEntries(actual.map((column, i) => [column, (cells[i] ?? "").trim()]));
    if (legacy) row.default_noon = "";
    rows.push(row);
    const problems = validateRow(kind, row, today);
    if (cells.length !== actual.length) problems.push("Column count template se nahi milta.");
    const identity = (kind === "animals" ? row.tag : row.name).toLowerCase();
    if (identity) {
      if (seen.has(identity)) problems.push("Is file mein tag ya naam dobara aaya hai.");
      seen.add(identity);
    }
    for (const message of problems) issues.push({ row: line, message });
  }
  if (!filled.length) issues.push({ row: 1, message: "Template mein abhi koi data row nahi." });
  return { count: filled.length, issues, rows: rows.slice(0, 10) };
}
