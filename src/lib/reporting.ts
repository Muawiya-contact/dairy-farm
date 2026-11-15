import { getSupabase } from "./supabase";
import { getSettings } from "./settings";

export type PeriodSummary = {
  produced: number; delivered: number; sold_litres: number; free_litres: number;
  milk_income: number; cash_collected: number; other_income: number;
  farm_expenses: number; home_expenses: number; profit: number;
};

export type PeriodCustomer = {
  customer_id: string; name: string; kind: string; sort_order: number; litres: number;
  charged: number; paid: number; discount: number; period_balance_change: number;
};

export type PeriodExpense = {
  expense_date: string; category: string; is_farm_cost: boolean; account: string; amount: number; note: string | null;
};

export type PeriodReport = {
  summary: PeriodSummary; customers: PeriodCustomer[]; expenses: PeriodExpense[];
  farmName: string;
};

type ReportRpc = <T>(name: string, args: { p_from: string; p_to: string }) => Promise<{ data: T[] | null; error: Error | null }>;

export function isReportDateRange(from: string, to: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && from <= to && to <= today;
}

/** A bounded server-side report avoids downloading every ledger row to the browser. */
export async function loadPeriodReport(from: string, to: string): Promise<PeriodReport> {
  // New migrations are deliberately usable before generated database types are refreshed.
  const rpc = getSupabase().rpc.bind(getSupabase()) as unknown as ReportRpc;
  const [settings, summaryResult, customersResult, expensesResult] = await Promise.all([
    getSettings(),
    rpc<PeriodSummary>("report_period_summary", { p_from: from, p_to: to }),
    rpc<PeriodCustomer>("report_period_customers", { p_from: from, p_to: to }),
    rpc<PeriodExpense>("report_period_expenses", { p_from: from, p_to: to }),
  ]);
  if (summaryResult.error) throw summaryResult.error;
  if (customersResult.error) throw customersResult.error;
  if (expensesResult.error) throw expensesResult.error;
  const summary = (summaryResult.data?.[0] ?? {}) as PeriodSummary;
  return {
    farmName: settings.farm_name,
    summary: {
      produced: Number(summary.produced ?? 0), delivered: Number(summary.delivered ?? 0),
      sold_litres: Number(summary.sold_litres ?? 0), free_litres: Number(summary.free_litres ?? 0),
      milk_income: Number(summary.milk_income ?? 0), cash_collected: Number(summary.cash_collected ?? 0),
      other_income: Number(summary.other_income ?? 0), farm_expenses: Number(summary.farm_expenses ?? 0),
      home_expenses: Number(summary.home_expenses ?? 0), profit: Number(summary.profit ?? 0),
    },
    customers: (customersResult.data ?? []).map((row) => ({ ...row, litres: Number(row.litres ?? 0), charged: Number(row.charged ?? 0), paid: Number(row.paid ?? 0), discount: Number(row.discount ?? 0), period_balance_change: Number(row.period_balance_change ?? 0) })) as PeriodCustomer[],
    expenses: (expensesResult.data ?? []).map((row) => ({ ...row, amount: Number(row.amount ?? 0) })) as PeriodExpense[],
  };
}
