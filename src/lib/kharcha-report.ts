import { addDays, formatDay } from "./dates";
import { getSupabase } from "./supabase";

export type KharchaReportBounds = { first_date: string | null; last_date: string };
export type KharchaReportSummary = {
  entry_count: number; total_expenses: number; farm_expenses: number; home_expenses: number; personal_expenses: number;
};
export type KharchaReportCategory = {
  category: string; expense_type: "farm" | "home" | "personal"; entry_count: number; total_amount: number;
};
export type KharchaReportRow = {
  expense_id: string; expense_date: string; description: string; category: string; account: string;
  expense_type: "farm" | "home" | "personal"; amount: number; recipient: string | null;
};

export function isKharchaReportDateRange(from: string, to: string, today: string): boolean {
  try {
    formatDay(from); formatDay(to); formatDay(today);
    return from <= to && to <= today;
  } catch { return false; }
}

export function kharchaMonthRange(month: string, today: string): { from: string; to: string } {
  const from = `${month}-01`;
  try {
    formatDay(from); formatDay(today);
    if (from > today) return { from, to: "" };
    const nextMonth = `${addDays(from, 32).slice(0, 7)}-01`;
    const lastDay = addDays(nextMonth, -1);
    return { from, to: lastDay > today ? today : lastDay };
  } catch { return { from: "", to: "" }; }
}

export function kharchaYearRange(year: string, today: string): { from: string; to: string } {
  const from = `${year}-01-01`;
  const lastDay = `${year}-12-31`;
  try {
    formatDay(from); formatDay(lastDay); formatDay(today);
    if (from > today) return { from, to: "" };
    return { from, to: lastDay > today ? today : lastDay };
  } catch { return { from: "", to: "" }; }
}

export async function loadKharchaReportBounds(): Promise<KharchaReportBounds> {
  const { data, error } = await getSupabase().rpc("kharcha_report_date_bounds", {});
  if (error) throw error;
  const row = data?.[0];
  return row ? { first_date: row.first_date ? String(row.first_date) : null, last_date: String(row.last_date) } : { first_date: null, last_date: "" };
}

export async function loadKharchaReportSummary(from: string, to: string, recipient: string | null): Promise<KharchaReportSummary> {
  const { data, error } = await getSupabase().rpc("kharcha_report_summary", { p_from: from, p_to: to, p_recipient: recipient });
  if (error) throw error;
  const row = data?.[0];
  return {
    entry_count: Number(row?.entry_count ?? 0), total_expenses: Number(row?.total_expenses ?? 0),
    farm_expenses: Number(row?.farm_expenses ?? 0), home_expenses: Number(row?.home_expenses ?? 0),
    personal_expenses: Number(row?.personal_expenses ?? 0),
  };
}

export async function loadKharchaReportCategories(from: string, to: string, recipient: string | null): Promise<KharchaReportCategory[]> {
  const { data, error } = await getSupabase().rpc("kharcha_report_category_totals", { p_from: from, p_to: to, p_recipient: recipient });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row, expense_type: row.expense_type as KharchaReportCategory["expense_type"],
    entry_count: Number(row.entry_count ?? 0), total_amount: Number(row.total_amount ?? 0),
  }));
}

export async function loadKharchaReportPeople(from: string, to: string): Promise<string[]> {
  const { data, error } = await getSupabase().rpc("kharcha_report_people", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((row) => row.recipient);
}

export async function loadKharchaReportRows(
  from: string, to: string, recipient: string | null, limit = 50, offset = 0,
): Promise<KharchaReportRow[]> {
  const { data, error } = await getSupabase().rpc("kharcha_report_rows", {
    p_from: from, p_to: to, p_recipient: recipient, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row, expense_date: String(row.expense_date),
    expense_type: row.expense_type as KharchaReportRow["expense_type"], amount: Number(row.amount ?? 0),
  }));
}

/** Fetch the selected report in bounded database pages for a complete PDF. */
export async function loadAllKharchaReportRows(from: string, to: string, recipient: string | null): Promise<KharchaReportRow[]> {
  const pageSize = 1000;
  const rows: KharchaReportRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadKharchaReportRows(from, to, recipient, pageSize, offset);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
