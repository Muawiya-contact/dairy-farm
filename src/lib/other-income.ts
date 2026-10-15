import { addDays } from "./dates";
import { parsePositiveAmount } from "./format";
import { getSupabase } from "./supabase";
import type { Account } from "./farm-data";

export type OtherIncomeInput = { date: string; kind: "manure" | "other"; amount: number; accountId: string; note: string | null };
export type OtherIncomeEntry = { id: string; income_date: string; kind: "animal_sale" | "manure" | "other"; amount: number; account_id: string; note: string | null };

export function parseOtherIncome(form: FormData, today: string, accounts: Account[]): OtherIncomeInput {
  const date = String(form.get("date") ?? "");
  try { addDays(date, 0); } catch { throw new RangeError("Sahi tareekh chunein."); }
  if (date > today) throw new RangeError("Aaj se aage ki tareekh nahi ho sakti.");
  const kind = String(form.get("kind") ?? "");
  if (kind !== "manure" && kind !== "other") throw new RangeError("Aamdani ki qism chunein.");
  const accountId = String(form.get("account") ?? "");
  const account = accounts.find((item) => item.id === accountId && item.active);
  if (!account || account.opening_date > date) throw new RangeError("Tareekh par khula hua account chunein.");
  const amount = parsePositiveAmount(String(form.get("amount") ?? ""));
  if (amount > 9_999_999_999.99) throw new RangeError("Raqam bohat bari hai.");
  return { date, kind, amount, accountId, note: String(form.get("note") ?? "").trim() || null };
}

export async function listOtherIncome(month: string): Promise<OtherIncomeEntry[]> {
  const next = addDays(`${month}-01`, 32).slice(0, 7) + "-01";
  const rows: OtherIncomeEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from("other_income").select("*")
      .gte("income_date", `${month}-01`).lt("income_date", next)
      .order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as OtherIncomeEntry[]));
    if (!data || data.length < 1000) return rows;
  }
}

export async function recordOtherIncome(id: string, input: OtherIncomeInput): Promise<void> {
  const row = { id, income_date: input.date, kind: input.kind, amount: input.amount,
    account_id: input.accountId, note: input.note };
  const { error } = await getSupabase().from("other_income").insert(row);
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("other_income").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || data.income_date !== input.date || data.kind !== input.kind ||
      Number(data.amount) !== input.amount || data.account_id !== input.accountId || data.note !== input.note) throw error;
}
