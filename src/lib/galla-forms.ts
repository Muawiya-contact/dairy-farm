import { addDays } from "./dates";
import { parseAmount, parsePositiveAmount } from "./format";

export type GallaAccount = { id: string; kind: string; active: boolean };

function value(form: FormData, key: string): string {
  const raw = form.get(key);
  if (raw != null && typeof raw !== "string") throw new RangeError("Form ki entry sahi likhein.");
  return raw?.trim() ?? "";
}

function date(form: FormData, today: string, openingDate?: string): string {
  const day = value(form, "date");
  try { addDays(day, 0); }
  catch { throw new RangeError("Sahi tareekh chunein."); }
  if (day > today) throw new RangeError("Aaj se aage ki tareekh nahi ho sakti.");
  if (openingDate && day < openingDate) throw new RangeError("Tareekh customer ke pichle hisaab se pehle nahi ho sakti.");
  return day;
}

function account(id: string, accounts: GallaAccount[], cashOnly = false): GallaAccount {
  const found = accounts.find((item) => item.id === id && item.active);
  if (!found || (cashOnly && found.kind !== "cash")) {
    throw new RangeError(cashOnly ? "Active cash account chunein." : "Active account chunein.");
  }
  return found;
}

function positive(form: FormData, key = "amount"): number {
  const raw = value(form, key);
  let amount: number;
  try { amount = parsePositiveAmount(raw); }
  catch { throw new RangeError("Raqam 0 se zyada aur 2 decimal tak likhein."); }
  if (amount > 9_999_999_999.99) throw new RangeError("Raqam bohat bari hai.");
  return amount;
}

export function parseTransfer(form: FormData, today: string, accounts: GallaAccount[]) {
  const from = account(value(form, "from"), accounts).id;
  const to = account(value(form, "to"), accounts).id;
  if (from === to) throw new RangeError("Dono taraf aik hi account nahi ho sakta.");
  return { date: date(form, today), from, to, amount: positive(form), note: value(form, "note") || null };
}

export function parseCashCount(form: FormData, today: string, accounts: GallaAccount[]) {
  const raw = value(form, "amount");
  let counted: number;
  try { counted = parseAmount(raw); }
  catch { throw new RangeError("Gini hui raqam 0 ya us se zyada aur 2 decimal tak likhein."); }
  if (counted > 9_999_999_999.99) throw new RangeError("Raqam bohat bari hai.");
  return { date: date(form, today), accountId: account(value(form, "account"), accounts, true).id,
    counted, reason: value(form, "reason") || null };
}

export function parseDiscount(form: FormData, today: string, openingDate?: string) {
  const reason = value(form, "reason");
  if (!reason) throw new RangeError("Riayat ki wajah likhein.");
  return { date: date(form, today, openingDate), amount: positive(form), reason };
}

export function parsePaymentCorrection(form: FormData, today: string, kind: string, accounts: GallaAccount[], openingDate?: string) {
  const reason = value(form, "reason");
  if (!reason) throw new RangeError("Correction ki wajah likhein.");
  const method = kind === "discount" ? null : value(form, "method");
  const accountId = kind === "discount" ? null : account(value(form, "account"), accounts).id;
  if (kind !== "discount" && !["cash", "bank", "easypaisa", "jazzcash", "cheque"].includes(method!)) {
    throw new RangeError("Wusooli ka tareeqa chunein.");
  }
  return { date: date(form, today, openingDate), amount: positive(form), method, accountId, reason };
}

export function parseVoidReason(form: FormData): string {
  const reason = value(form, "reason");
  if (!reason) throw new RangeError("Entry radd karne ki wajah likhein.");
  return reason;
}
