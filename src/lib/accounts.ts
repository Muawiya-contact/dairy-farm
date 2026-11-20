import type { Database } from "./database.types";
import { getSupabase } from "./supabase";
import { addDays, todayPK } from "./dates";

type Row = Database["public"]["Tables"]["accounts"]["Row"];
export type FarmAccount = Pick<Row, "id" | "name" | "kind" | "opening_balance" | "opening_date" | "active" | "is_farm_cash" | "is_owner">;
export type AccountFields = Pick<FarmAccount, "name" | "opening_balance" | "opening_date" | "active">;

const columns = "id,name,kind,opening_balance,opening_date,active,is_farm_cash,is_owner";

export function validateAccount(account: AccountFields, isFarmCash = false, kind?: string, isOwner = false): string | null {
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
  if (isOwner && kind !== "person") return "Maalik ka account Person qism ka hona chahiye.";
  return null;
}

export async function getAccounts(): Promise<FarmAccount[]> {
  const { data, error } = await getSupabase().from("accounts").select(columns).order("sort_order").order("name");
  if (error) throw error;
  return data;
}

export async function createAccount(input: AccountFields & { kind: "cash" | "bank" | "person"; is_owner: boolean }): Promise<void> {
  const issue = validateAccount(input, false, input.kind, input.is_owner);
  if (issue) throw new RangeError(issue);
  const { error } = await getSupabase().from("accounts").insert({
    name: input.name.trim(), kind: input.kind, opening_balance: input.opening_balance,
    opening_date: input.opening_date, active: input.active, is_farm_cash: false, is_owner: input.is_owner,
  });
  if (error) throw error;
}

export async function updateAccount(id: string, input: AccountFields & { is_owner: boolean }): Promise<void> {
  const { data, error: lookupError } = await getSupabase().from("accounts").select("is_farm_cash,kind").eq("id", id).single();
  if (lookupError) throw lookupError;
  const issue = validateAccount(input, data.is_farm_cash, data.kind, input.is_owner);
  if (issue) throw new RangeError(issue);
  const { error } = await getSupabase().from("accounts").update({
    name: input.name.trim(), opening_balance: input.opening_balance,
    opening_date: input.opening_date, active: input.active, is_owner: input.is_owner,
  }).eq("id", id).select("id").single();
  if (error) throw error;
}
