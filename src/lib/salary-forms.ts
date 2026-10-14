import { addDays, monthStart } from "./dates";
import { parseAmount, parsePositiveAmount } from "./format";

export type SalaryStaff = { id: string; name: string; monthly_salary: number; active: boolean };
export type SalaryPeriod = { id: string; staff_id: string; salary_month: string; agreed_amount: number };
export type SalaryPayment = { salary_period_id: string | null; amount: number };
export type SalaryAccount = { id: string; active: boolean; opening_date: string };
export type StaffFields = { name: string; role: string | null; monthly_salary: number; active: boolean };
export type PeriodFields = { staff_id: string; salary_month: string; agreed_amount: number };
export type PaymentFields = { date: string; periodId: string; staffId: string; accountId: string; amount: number; note: string | null };

function value(form: FormData, key: string): string {
  const raw = form.get(key);
  if (raw != null && typeof raw !== "string") throw new RangeError("Form ki entry sahi likhein.");
  return raw?.trim() ?? "";
}

function rupees(input: string, positive: boolean): number {
  let result: number;
  try { result = positive ? parsePositiveAmount(input) : parseAmount(input); }
  catch { throw new RangeError(positive ? "Raqam 0 se zyada aur 2 decimal tak likhein." : "Mahwari tankhwah 0 ya zyada aur 2 decimal tak likhein."); }
  if (result > 9_999_999_999.99) throw new RangeError("Raqam bohat bari hai.");
  return result;
}

export function parseStaff(form: FormData): StaffFields {
  const name = value(form, "name");
  const role = value(form, "role");
  if (!name || name.length > 100) throw new RangeError("Mulazim ka naam 1 se 100 huroof tak likhein.");
  if (role.length > 100) throw new RangeError("Kaam ki tafseel 100 huroof tak likhein.");
  return {
    name, role: role || null, monthly_salary: rupees(value(form, "monthly_salary"), false),
    active: form.get("active") === "on",
  };
}

export function parseSalaryMonth(input: string, today: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input)) throw new RangeError("Sahi tankhwah ka maheena chunein.");
  const month = monthStart(`${input}-01`);
  if (month > monthStart(today)) throw new RangeError("Aane wale mahine ki tankhwah abhi na kholein.");
  return month;
}

export function parsePeriod(form: FormData, today: string, staff: SalaryStaff[]): PeriodFields {
  const staffId = value(form, "staff");
  if (!staff.some((item) => item.id === staffId)) throw new RangeError("Mulazim chunein.");
  return {
    staff_id: staffId,
    salary_month: parseSalaryMonth(value(form, "month"), today),
    agreed_amount: rupees(value(form, "agreed_amount"), true),
  };
}

export function paidCents(periodId: string, payments: SalaryPayment[]): number {
  return payments.filter((item) => item.salary_period_id === periodId)
    .reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
}

export function remainingCents(period: SalaryPeriod, payments: SalaryPayment[]): number {
  return Math.round(Number(period.agreed_amount) * 100) - paidCents(period.id, payments);
}

export function parsePayment(
  form: FormData, today: string, period: SalaryPeriod,
  accounts: SalaryAccount[], payments: SalaryPayment[],
): PaymentFields {
  const date = value(form, "date");
  try { addDays(date, 0); }
  catch { throw new RangeError("Sahi tareekh chunein."); }
  if (date > today) throw new RangeError("Aaj se aage ki tareekh nahi ho sakti.");
  if (date < period.salary_month) throw new RangeError("Tankhwah ka maheena shuru hone ke baad ada karein.");
  const accountId = value(form, "account");
  const account = accounts.find((item) => item.id === accountId && item.active);
  if (!account) throw new RangeError("Active account chunein.");
  if (date < account.opening_date) throw new RangeError("Account khulne ke baad ki tareekh chunein.");
  const amount = rupees(value(form, "amount"), true);
  if (Math.round(amount * 100) > remainingCents(period, payments)) {
    throw new RangeError("Baqi tankhwah se zyada raqam hai.");
  }
  const note = value(form, "note");
  if (note.length > 500) throw new RangeError("Note 500 huroof tak likhein.");
  return { date, periodId: period.id, staffId: period.staff_id, accountId, amount, note: note || null };
}

export function parseAgreedAmount(input: string, period: SalaryPeriod, payments: SalaryPayment[]): number {
  const amount = rupees(input, true);
  const paid = paidCents(period.id, payments);
  if (Math.round(amount * 100) < paid) {
    throw new RangeError("Tay shuda tankhwah ada shuda raqam se kam nahi ho sakti.");
  }
  if (paid > 0 && amount !== Number(period.agreed_amount)) {
    throw new RangeError("Adaigi ke baad tay shuda tankhwah nahi badal sakte.");
  }
  return amount;
}
