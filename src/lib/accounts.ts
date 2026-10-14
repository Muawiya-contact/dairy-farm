import type { Database } from "./database.types";
import { getSupabase } from "./supabase";
import { addDays, todayPK } from "./dates";

type Row = Database["public"]["Tables"]["accounts"]["Row"];
export type FarmAccount = Pick<Row, "id" | "name" | "kind" | "opening_balance" | "opening_date" | "active" | "is_farm_cash">;
export type AccountFields = Pick<FarmAccount, "name" | "opening_balance" | "opening_date" | "active">;

const columns = "id,name,kind,opening_balance,opening_date,active,is_farm_cash";

export function validateAccount(account: AccountFields, isFarmCash = false): string | null {
  if (!account.name.trim()) return "Account ka naam likhein.";
  if (!Number.isFinite(account.opening_balance)) return "Opening balance sahi likhein.";
  if (Math.abs(account.opening_balance) > 9_999_999_999.99 ||
      Math.abs(account.opening_balance * 100 - Math.round(account.opening_balance * 100)) > 1e-6) {
    return "Opening balance 2 decimal tak aur 10 arab se kam likhein.";
  }
  try { addDays(account.opening_date, 0); }
  catch { return "Opening date sahi likhein."; }
  if (account.opening_date > todayPK()) return "Opening date aaj se aage nahi ho sakti.";
  if (isFarmCash && !account.active) return "Farm galla band nahi ho sakta.";
  return null;
}

export async function getAccounts(): Promise<FarmAccount[]> {
  const { data, error } = await getSupabase().from("accounts").select(columns).order("sort_order").order("name");
  if (error) throw error;
  return data;
}

export async function createAccount(input: AccountFields & { kind: "cash" | "bank" | "person" }): Promise<void> {
  const issue = validateAccount(input);
  if (issue) throw new RangeError(issue);
  const { error } = await getSupabase().from("accounts").insert({
    name: input.name.trim(), kind: input.kind, opening_balance: input.opening_balance,
    opening_date: input.opening_date, active: input.active, is_farm_cash: false,
  });
  if (error) throw error;
}

export async function updateAccount(id: string, input: AccountFields): Promise<void> {
  const { data, error: lookupError } = await getSupabase().from("accounts").select("is_farm_cash").eq("id", id).single();
  if (lookupError) throw lookupError;
  const issue = validateAccount(input, data.is_farm_cash);
  if (issue) throw new RangeError(issue);
  const { error } = await getSupabase().from("accounts").update({
    name: input.name.trim(), opening_balance: input.opening_balance,
    opening_date: input.opening_date, active: input.active,
  }).eq("id", id).select("id").single();
  if (error) throw error;
}
