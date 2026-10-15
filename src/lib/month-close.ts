import { getSupabase } from "./supabase";
import { addDays, monthStart, todayPK } from "./dates";
import type { Database } from "./database.types";

export type MonthLock = Database["public"]["Tables"]["month_locks"]["Row"];
export type MonthLockEvent = Database["public"]["Tables"]["month_lock_events"]["Row"];

export function previousMonth(today = todayPK()): string {
  return addDays(monthStart(today), -1).slice(0, 7);
}

export function validateMonthClose(month: string, today = todayPK()): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "Sahi maheena chunein.";
  return month >= today.slice(0, 7) ? "Sirf guzra hua poora maheena band ho sakta hai." : null;
}

export async function getMonthLocks(): Promise<MonthLock[]> {
  const { data, error } = await getSupabase().from("month_locks").select("*").order("month", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMonthLockEvents(): Promise<MonthLockEvent[]> {
  const { data, error } = await getSupabase().from("month_lock_events").select("*")
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function closeFarmMonth(month: string, note: string): Promise<boolean> {
  const issue = validateMonthClose(month);
  if (issue) throw new RangeError(issue);
  if (note.length > 500) throw new RangeError("Note 500 harf tak likhein.");
  const { data, error } = await getSupabase().rpc("close_farm_month", { p_month: `${month}-01`, p_note: note.trim() || null });
  if (error) throw error;
  return data;
}

export async function reopenFarmMonth(month: string, reason: string): Promise<boolean> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError("Sahi maheena chunein.");
  if (reason.trim().length < 5 || reason.length > 500) throw new RangeError("Dobara kholne ki wajah 5 se 500 harf tak likhein.");
  const { data, error } = await getSupabase().rpc("reopen_farm_month", { p_month: `${month}-01`, p_reason: reason.trim() });
  if (error) throw error;
  return data;
}
