import { addDays } from "./dates";
import { parsePositiveAmount } from "./format";

export type ExpenseMode = "farm" | "home" | "personal";
export type ExpenseFormCategory = { id: string; name: string; is_farm_cost: boolean; is_salary: boolean; active: boolean };
export type ExpenseFormAccount = { id: string; active: boolean; opening_date: string };
export type ExpenseInput = { date: string; categoryId: string; accountId: string; amount: number; note: string | null };

export const isHomeCategory = (category: Pick<ExpenseFormCategory, "name" | "is_farm_cost">): boolean =>
  !category.is_farm_cost && category.name.trim().toLocaleLowerCase("en") === "ghar ka kharcha";

export function expenseMode(category: Pick<ExpenseFormCategory, "name" | "is_farm_cost"> | undefined): ExpenseMode {
  if (category?.is_farm_cost) return "farm";
  return category && isHomeCategory(category) ? "home" : "personal";
}

function value(form: FormData, key: string): string {
  const raw = form.get(key);
  if (raw != null && typeof raw !== "string") throw new RangeError("Form ki entry sahi likhein.");
  return raw?.trim() ?? "";
}

export function parseExpenseEntry(
  form: FormData, mode: ExpenseMode, today: string,
  accounts: ExpenseFormAccount[], categories: ExpenseFormCategory[],
): ExpenseInput {
  const date = value(form, "date");
  try { addDays(date, 0); }
  catch { throw new RangeError("Sahi tareekh chunein."); }
  if (date > today) throw new RangeError("Aaj se aage ki tareekh nahi ho sakti.");

  const accountId = value(form, "account");
  const account = accounts.find((item) => item.id === accountId && item.active);
  if (!account) throw new RangeError("Active account chunein.");
  if (date < account.opening_date) throw new RangeError("Account khulne ke baad ki tareekh chunein.");

  const category = mode === "home"
    ? categories.find((item) => item.active && isHomeCategory(item))
    : categories.find((item) => item.id === value(form, "category") && item.active);
  if (!category || expenseMode(category) !== mode) throw new RangeError("Is qism ki active category chunein.");
  if (category.is_salary) throw new RangeError("Tankhwah Mulazim aur tankhwah page par darj karein.");

  let amount: number;
  try { amount = parsePositiveAmount(value(form, "amount")); }
  catch { throw new RangeError("Raqam 0 se zyada aur 2 decimal tak likhein."); }
  if (amount > 9_999_999_999.99) throw new RangeError("Raqam bohat bari hai.");
  return { date, categoryId: category.id, accountId, amount, note: value(form, "note") || null };
}

export function parseExpenseCorrection(form: FormData, today: string,
  accounts: ExpenseFormAccount[], categories: ExpenseFormCategory[]) {
  const categoryId = String(form.get("category") ?? "");
  const category = categories.find((item) => item.id === categoryId);
  const input = parseExpenseEntry(form, expenseMode(category), today, accounts, categories);
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5 || reason.length > 500) throw new RangeError("Durusti ki wajah 5 se 500 harf tak likhein.");
  return { input, reason };
}
