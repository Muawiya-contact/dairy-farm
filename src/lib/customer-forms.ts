import { addDays } from "./dates";
import { parseAmount, parseSignedAmount } from "./format";
import { normalizePhone } from "./phone";

export type CustomerKind = "regular" | "contractor" | "company" | "cash" | "free";
export type NewCustomer = {
  name: string; phone: string; kind: CustomerKind; morning: number; evening: number;
  rate: number; openingBalance: number; openingDate: string;
};
export type CustomerProfile = { name: string; phone: string; morning: number; evening: number; active: boolean };
export type CustomerPayment = { date: string; amount: number; method: string; accountId: string };
export type CustomerCompanyBill = { from: string; to: string; litres: number; amount: number };

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

function day(form: FormData, key: string, label: string, today: string): string {
  const value = text(form, key);
  try { addDays(value, 0); }
  catch { throw new RangeError(`${label}: sahi tareekh likhein.`); }
  if (value > today) throw new RangeError(`${label}: aaj se aage ki tareekh nahi ho sakti.`);
  return value;
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
    evening: decimal(form, "evening", "Shaam doodh", { max: 5000 }),
    rate: kind === "free" || kind === "company" ? 0 : decimal(form, "rate", "Doodh ka rate", { required: true, min: 0.01, max: RATE_MAX }),
    openingBalance: kind === "free" || kind === "cash" ? 0 : decimal(form, "openingBalance", "Pichla baqaya", { signed: true }),
    openingDate,
  };
}

export function parseCustomerProfile(form: FormData): CustomerProfile {
  return {
    name: name(form), phone: normalizePhone(text(form, "phone")),
    morning: decimal(form, "morning", "Subah doodh", { max: 5000 }),
    evening: decimal(form, "evening", "Shaam doodh", { max: 5000 }),
    active: form.get("active") === "on",
  };
}

export function parseCustomerPayment(form: FormData, today: string): CustomerPayment {
  const method = text(form, "method");
  const accountId = text(form, "account");
  if (!["cash", "bank", "easypaisa", "jazzcash", "cheque"].includes(method) || !accountId) {
    throw new RangeError("Wusooli ka tareeqa aur account chunein.");
  }
  return {
    date: day(form, "date", "Wusooli ki tareekh", today),
    amount: decimal(form, "amount", "Wusooli", { required: true, min: 0.01 }),
    method, accountId,
  };
}

export function parseCustomerRate(form: FormData, today: string, openingDate: string) {
  const date = day(form, "date", "Rate ki tareekh", today);
  if (date < openingDate) throw new RangeError("Rate ki tareekh customer ke pichle hisaab se pehle nahi ho sakti.");
  return { date, rate: decimal(form, "rate", "Doodh ka rate", { required: true, min: 0.01, max: RATE_MAX }) };
}

export function parseCompanyBill(form: FormData, today: string): CustomerCompanyBill {
  const from = day(form, "from", "Parchi shuru", today);
  const to = day(form, "to", "Parchi khatam", today);
  if (to < from) throw new RangeError("Parchi khatam hone ki tareekh shuru se pehle nahi ho sakti.");
  return {
    from, to,
    litres: decimal(form, "litres", "Slip litres", { required: true, max: RATE_MAX }),
    amount: decimal(form, "amount", "Company bill", { required: true }),
  };
}
