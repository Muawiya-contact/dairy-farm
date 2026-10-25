import { getSupabase } from "./supabase";
import type { Database } from "./database.types";

export type HistoricalRecord = Database["public"]["Tables"]["historical_records"]["Row"];
export type HistoricalKind = "all" | "milk_day" | "expense_day" | "customer_month" | "breeding" | "animal_event";
export const HISTORICAL_PAGE_SIZE = 50;
const kinds = new Set<HistoricalKind>(["all", "milk_day", "expense_day", "customer_month", "breeding", "animal_event"]);

export function nextMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError("Maheena sahi nahi hai.");
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

export async function historicalPage(kind: HistoricalKind, month: string, page: number, search = ""): Promise<{ rows: HistoricalRecord[]; count: number }> {
  if (!kinds.has(kind) || (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) || !Number.isInteger(page) || page < 0 || search.length > 80) {
    throw new RangeError("Purane record ka filter sahi nahi hai.");
  }
  let query = getSupabase().from("historical_records")
    .select("*", { count: "exact" })
    .order("record_date", { ascending: false, nullsFirst: false })
    .order("source_key")
    .range(page * HISTORICAL_PAGE_SIZE, (page + 1) * HISTORICAL_PAGE_SIZE - 1);
  if (kind !== "all") query = query.eq("kind", kind);
  if (month) query = query.gte("record_date", `${month}-01`).lt("record_date", `${nextMonth(month)}-01`);
  const safeSearch = search.trim().replace(/[^\p{L}\p{N} -]/gu, "");
  if (safeSearch) query = query.or(`source_label.ilike.%${safeSearch}%,canonical_label.ilike.%${safeSearch}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}
