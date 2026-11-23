import { addDays } from "./dates";
import { parseAmount, parseSignedAmount } from "./format";
import { normalizePhone } from "./phone";

export type CustomerKind = "regular" | "contractor" | "company" | "cash" | "free";
export type FreeReason = "owner" | "staff" | "charity" | "calves" | "other";
export type NewCustomer = {
  name: string; phone: string; kind: CustomerKind; morning: number; noon: number; evening: number;
  rate: number; openingBalance: number; openingDate: string; freeReason: FreeReason | null;
};
export type CustomerProfile = { name: string; phone: string; morning: number; noon: number; evening: number; active: boolean; freeReason: FreeReason | null };
export type CustomerPayment = { date: string; amount: number; method: string; accountId: string };
export type CustomerBalanceAdjustment = { date: string; balanceChange: number; reason: string };
export type CustomerCompanyBill = { from: string; to: string; litres: number; amount: number };
export type CustomerSettlement = { action: "payment" | "discount" | "refund" | "zero"; date: string; method: string | null; accountId: string | null; reason: string };

const MONEY_MAX = 9_999_999_999.99;
const RATE_MAX = 99_999_999.99;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  if (value != null && typeof value !== "string") throw new RangeError("Form ki entry sahi likhein.");
  return value?.trim() ?? "";
}

function decimal(form: FormData, key: string, label: string, options: {
  signed?: boolean; required?: boolean; min?: number; max?: number;
} = {}): number {
  const raw = text(form, key);
  if (!raw && !options.required) return 0;
  let value: number;
  try { value = options.signed ? parseSignedAmount(raw) : parseAmount(raw); }
  catch { throw new RangeError(`${label}: 2 decimal tak sahi raqam likhein.`); }
  if (value < (options.min ?? (options.signed ? -MONEY_MAX : 0)) || value > (options.max ?? MONEY_MAX)) {
    throw new RangeError(`${label}: raqam apni had mein likhein.`);
  }
  return value;
}

function day(form: FormData, key: string, label: string, maxDate: string, maxLabel = "aaj"): string {
  const value = text(form, key);
  try { addDays(value, 0); }
  catch { throw new RangeError(`${label}: sahi tareekh likhein.`); }
  if (value > maxDate) throw new RangeError(`${label}: ${maxLabel} se aage ki tareekh nahi ho sakti.`);
  return value;
}

function freeReason(form: FormData, kind: CustomerKind): FreeReason | null {
  if (kind !== "free") return null;
  const value = text(form, "freeReason");
  if (!["owner", "staff", "charity", "calves", "other"].includes(value)) {
    throw new RangeError("Muft doodh ki wajah chunein.");
  }
  return value as FreeReason;
}

function name(form: FormData): string {
  const value = text(form, "name");
  if (!value) throw new RangeError("Customer ka naam likhein.");
  return value;
}

export function parseNewCustomer(form: FormData, kind: CustomerKind, today: string): NewCustomer {
  const openingDate = day(form, "openingDate", "Pichla hisaab", today);
  return {
    name: name(form), phone: normalizePhone(text(form, "phone")), kind,
    morning: decimal(form, "morning", "Subah doodh", { max: 5000 }),
    noon: decimal(form, "noon", "Dopehr doodh", { max: 5000 }),
    evening: decimal(form, "evening", "Shaam doodh", { max: 5000 }),
    rate: kind === "free" || kind === "company" ? 0 : decimal(form, "rate", "Doodh ka rate", { required: true, min: 0.01, max: RATE_MAX }),
    openingBalance: kind === "free" || kind === "cash" ? 0 : decimal(form, "openingBalance", "Pichla baqaya", { signed: true }),
    openingDate, freeReason: freeReason(form, kind),
  };
}

export function parseCustomerProfile(form: FormData, kind: CustomerKind): CustomerProfile {
  return {
    name: name(form), phone: normalizePhone(text(form, "phone")),
    morning: decimal(form, "morning", "Subah doodh", { max: 5000 }),
    noon: decimal(form, "noon", "Dopehr doodh", { max: 5000 }),
    evening: decimal(form, "evening", "Shaam doodh", { max: 5000 }),
    active: form.get("active") === "on", freeReason: freeReason(form, kind),
  };
}

export function parseCustomerPayment(form: FormData, today: string, openingDate?: string): CustomerPayment {
  const method = text(form, "method");
  const accountId = text(form, "account");
  if (!["cash", "bank", "easypaisa", "jazzcash", "cheque"].includes(method) || !accountId) {
    throw new RangeError("Wusooli ka tareeqa aur account chunein.");
  }
  const date = day(form, "date", "Wusooli ki tareekh", today);
  if (openingDate && date < openingDate) throw new RangeError("Wusooli ki tareekh customer ke pichle hisaab se pehle nahi ho sakti.");
  return {
    date,
    amount: decimal(form, "amount", "Wusooli", { required: true, min: 0.01 }),
    method, accountId,
  };
}

/** Positive changes add an amount owed; advance entries are stored as negative changes. */
export function parseCustomerBalanceAdjustment(form: FormData, today: string, openingDate: string): CustomerBalanceAdjustment {
  const date = day(form, "date", "Purane Khata ki tareekh", today);
  if (date < openingDate) throw new RangeError("Purana Khata customer ke pichle hisaab se pehle nahi ho sakta.");
  const direction = text(form, "direction");
  if (direction !== "due" && direction !== "advance") throw new RangeError("Baqaya ya customer ka advance chunein.");
  const amount = decimal(form, "amount", "Purana Khata", { required: true, min: 0.01 });
  const reason = text(form, "reason");
  if (reason.length < 3 || reason.length > 500) throw new RangeError("Purane Khata ki wajah 3 se 500 harf tak likhein.");
  return { date, balanceChange: direction === "advance" ? -amount : amount, reason };
}

export function parseCustomerSettlement(form: FormData, today: string, openingDate: string, balance: number): CustomerSettlement {
  const action = balance > 0 ? text(form, "action") : balance < 0 ? "refund" : "zero";
  if (!(["payment", "discount"].includes(action) && balance > 0) && !(action === "refund" && balance < 0) && !(action === "zero" && balance === 0)) {
    throw new RangeError("Khata ka aakhri tareeqa aur baqaya mail nahi khata.");
  }
  const date = day(form, "date", "Khata band ki tareekh", today);
  if (date < openingDate) throw new RangeError("Khata band ki tareekh customer ke pichle hisaab se pehle nahi ho sakti.");
  const reason = text(form, "reason");
  if (reason.length < 3 || reason.length > 500) throw new RangeError("Khata band karne ki wajah 3 se 500 harf tak likhein.");
  if (action === "discount" || action === "zero") return { action, date, method: null, accountId: null, reason };
  const method = text(form, "method"); const accountId = text(form, "account");
  if (!(["cash", "bank", "easypaisa", "jazzcash", "cheque"].includes(method)) || !accountId) {
    throw new RangeError(action === "refund" ? "Advance wapas karne ka tareeqa aur account chunein." : "Wusooli ka tareeqa aur account chunein.");
  }
  return { action: action as "payment" | "discount" | "refund", date, method, accountId, reason };
}

export function parseCustomerRate(form: FormData, today: string, openingDate: string) {
  const date = day(form, "date", "Rate ki tareekh", addDays(today, 365), "aik saal");
  if (date < openingDate) throw new RangeError("Rate ki tareekh customer ke pichle hisaab se pehle nahi ho sakti.");
  return { date, rate: decimal(form, "rate", "Doodh ka rate", { required: true, min: 0.01, max: RATE_MAX }) };
}

export function parseCompanyBill(form: FormData, today: string, openingDate?: string): CustomerCompanyBill {
  const from = day(form, "from", "Parchi shuru", today);
  const to = day(form, "to", "Parchi khatam", today);
  if (openingDate && from < openingDate) throw new RangeError("Parchi customer ke pichle hisaab se pehle nahi ho sakti.");
  if (to < from) throw new RangeError("Parchi khatam hone ki tareekh shuru se pehle nahi ho sakti.");
  return {
    from, to,
    litres: decimal(form, "litres", "Slip litres", { required: true, max: RATE_MAX }),
    amount: decimal(form, "amount", "Company bill", { required: true }),
  };
}
