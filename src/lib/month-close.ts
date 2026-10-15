import { getSupabase } from "./supabase";
import { addDays, daysBetween, monthStart, todayPK } from "./dates";
import { getAccountMonth, monthBounds } from "./galla";
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

export function shouldRemindCloseMonth(today: string, locks: readonly Pick<MonthLock, "month">[], goLiveDate: string): boolean {
  if (Number(today.slice(8)) <= 10) return false;
  const lastMonthName = previousMonth(today);
  if (lastMonthName < goLiveDate.slice(0, 7)) return false;
  const lastMonth = `${lastMonthName}-01`;
  return !locks.some((lock) => lock.month === lastMonth);
}

export function recentClosedMonths(today = todayPK()): string[] {
  const months: string[] = [];
  let current = previousMonth(today);
  for (let index = 0; index < 12; index++) {
    months.push(current);
    current = previousMonth(`${current}-15`);
  }
  return months;
}

export function countMissingMilkShifts(start: string, end: string, goLive: string,
  shifts: readonly { milk_date: string; shift: string }[]): number {
  const first = start > goLive ? start : goLive;
  if (first >= end) return 0;
  const recorded = new Set(shifts.filter((row) => row.milk_date >= first && row.milk_date < end)
    .map((row) => `${row.milk_date}:${row.shift}`));
  return Math.max(0, daysBetween(first, end) * 2 - recorded.size);
}

export async function getMonthCloseSummary(month: string) {
  const issue = validateMonthClose(month);
  if (issue) throw new RangeError(issue);
  const { start, end } = monthBounds(month);
  const supabase = getSupabase();
  const [milk, pnl, accounts, settings, shifts] = await Promise.all([
    supabase.rpc("milk_month_summary", { p_month: start }),
    supabase.rpc("pnl_month", { p_month: start }),
    getAccountMonth(month),
    supabase.from("settings").select("go_live_date").eq("id", 1).single(),
    supabase.from("milk_shifts").select("milk_date,shift").gte("milk_date", start).lt("milk_date", end),
  ]);
  for (const result of [milk, pnl, settings, shifts]) if (result.error) throw result.error;
  const galla = accounts.find((account) => account.is_farm_cash);
  return {
    produced: Number(milk.data?.[0]?.produced ?? 0),
    sales: Number(pnl.data?.[0]?.milk_income ?? 0),
    expenses: Number(pnl.data?.[0]?.farm_expenses ?? 0),
    profit: Number(pnl.data?.[0]?.profit ?? 0),
    gallaClosing: galla ? Number(galla.closing) : null,
    missingShifts: countMissingMilkShifts(start, end, settings.data!.go_live_date, shifts.data ?? []),
  };
}

export type MonthCloseSummary = Awaited<ReturnType<typeof getMonthCloseSummary>>;

export function sameMonthCloseSummary(a: MonthCloseSummary, b: MonthCloseSummary): boolean {
  return a.produced === b.produced && a.sales === b.sales && a.expenses === b.expenses
    && a.profit === b.profit && a.gallaClosing === b.gallaClosing && a.missingShifts === b.missingShifts;
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
