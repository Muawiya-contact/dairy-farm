import { getSupabase } from "./supabase";
import type { Database } from "./database.types";

type BoundsRow = Database["public"]["Functions"]["owner_transfer_bounds"]["Returns"][number];
type SummaryRow = Database["public"]["Functions"]["owner_transfer_summary"]["Returns"][number];
type TransferRow = Database["public"]["Functions"]["owner_transfer_rows"]["Returns"][number];
export type DailyClosing = Database["public"]["Functions"]["galla_daily_closing"]["Returns"][number];

export type OwnerTransferBounds = { first_date: string; last_date: string };
export type OwnerTransferSummary = {
  total_withdrawals: number; total_deposits: number; net_amount: number;
  withdrawal_count: number; deposit_count: number;
};
export type OwnerTransfer = Omit<TransferRow, "transfer_date"> & { transfer_date: string };

export async function getOwnerTransferBounds(): Promise<OwnerTransferBounds> {
  const { data, error } = await getSupabase().rpc("owner_transfer_bounds");
  if (error) throw error;
  const row: BoundsRow | undefined = data?.[0];
  return row ? { first_date: String(row.first_date).slice(0, 10), last_date: String(row.last_date).slice(0, 10) }
    : { first_date: "", last_date: "" };
}

export async function getOwnerTransferSummary(from: string, to: string): Promise<OwnerTransferSummary> {
  const { data, error } = await getSupabase().rpc("owner_transfer_summary", { p_from: from, p_to: to });
  if (error) throw error;
  const row: SummaryRow | undefined = data?.[0];
  return {
    total_withdrawals: Number(row?.total_withdrawals ?? 0),
    total_deposits: Number(row?.total_deposits ?? 0),
    net_amount: Number(row?.net_amount ?? 0),
    withdrawal_count: Number(row?.withdrawal_count ?? 0),
    deposit_count: Number(row?.deposit_count ?? 0),
  };
}

export async function getOwnerTransferRows(from: string, to: string, limit = 50, offset = 0): Promise<OwnerTransfer[]> {
  const { data, error } = await getSupabase().rpc("owner_transfer_rows", {
    p_from: from, p_to: to, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, transfer_date: String(row.transfer_date).slice(0, 10) }));
}

export async function getAllOwnerTransferRows(from: string, to: string): Promise<OwnerTransfer[]> {
  const pageSize = 1000;
  const rows: OwnerTransfer[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await getOwnerTransferRows(from, to, pageSize, offset);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function getGallaDailyClosing(accountId: string, date: string): Promise<DailyClosing> {
  const { data, error } = await getSupabase().rpc("galla_daily_closing", { p_account: accountId, p_date: date });
  if (error) throw error;
  if (!data?.[0]) throw new Error("Galla ka closing nahi mila.");
  const row = data[0];
  return {
    ...row,
    latest_count_date: row.latest_count_date == null ? null : String(row.latest_count_date).slice(0, 10),
  };
}

export const OWNER_TRANSFER_COLUMNS = [
  "transfer_date", "direction", "amount", "owner_account_name", "farm_account_name", "note", "recorded_by",
];

export function flattenOwnerReportRows(
  summary: OwnerTransferSummary, rows: OwnerTransfer[],
): Record<string, unknown>[] {
  const totals = {
    total_withdrawals: summary.total_withdrawals,
    total_deposits: summary.total_deposits,
    net_amount: summary.net_amount,
    withdrawal_count: summary.withdrawal_count,
    deposit_count: summary.deposit_count,
  };
  if (!rows.length) return [{ ...totals, transfer_date: "", direction: "", amount: "", owner_account_name: "", farm_account_name: "", note: "", recorded_by: "" }];
  return rows.map((row) => ({ ...totals, ...row }));
}
