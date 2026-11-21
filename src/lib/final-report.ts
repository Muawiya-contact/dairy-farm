import { addDays, monthStart } from "./dates";
import { loadFinancialReport, type FinancialReportData } from "./financial-report";
import {
  loadMilkReportDistributionDaily, loadMilkReportDistributionShifts, loadMilkReportDistributionTotals,
  type MilkReportDistributionDaily, type MilkReportDistributionShift, type MilkReportDistributionTotals,
} from "./reporting";
import { getOwnerTransferSummary, type OwnerTransferSummary } from "./owner-account-report";
import { getSupabase } from "./supabase";
import type { PdfSection } from "./export-data";

export type FinalReportPreset = "month" | "previous" | "year" | "custom";
export type FinalReportKhataRow = {
  is_grand_total: boolean; customer_id: string | null; name: string; sort_order: number;
  litres: number; opening_balance: number; opening_added: number; charges: number;
  total_payable: number; payments: number; discounts: number; refunds: number;
  closing_balance: number; receivables_due: number; customer_credits: number;
};
export type FinalReportCashPosition = { closing_cash_bank_balance: number | null; cash_bank_account_count: number };
export type FinalReportExpenseCategory = { category: string; is_farm_cost: boolean; entries: number; amount: number };
export type FinalReportData = {
  financial: FinancialReportData;
  milk: { daily: MilkReportDistributionDaily[]; shifts: MilkReportDistributionShift[]; totals: MilkReportDistributionTotals };
  ownerTransfers: OwnerTransferSummary;
  khata: FinalReportKhataRow[];
  cashPosition: FinalReportCashPosition;
  expenses: FinalReportExpenseCategory[];
};

export function finalReportRange(preset: FinalReportPreset, today: string): [string, string] {
  if (preset === "previous") {
    const to = addDays(monthStart(today), -1);
    return [monthStart(to), to];
  }
  if (preset === "year") return [`${today.slice(0, 4)}-01-01`, today];
  if (preset === "custom") return [today, today];
  return [monthStart(today), today];
}

const hundredths = (value: number) => Math.round(Number(value || 0) * 100);

/** A zero result means the saved opening, production, destinations, and closing stock balance. */
export function milkReconciliationVariance(row: Pick<MilkReportDistributionDaily,
  "opening_litres" | "produced_litres" | "khata_litres" | "cash_litres" | "free_litres" | "farm_use_litres" | "wasted_litres" | "remaining_litres">): number {
  const available = hundredths(row.opening_litres) + hundredths(row.produced_litres);
  const allocated = hundredths(row.khata_litres) + hundredths(row.cash_litres) + hundredths(row.free_litres)
    + hundredths(row.farm_use_litres) + hundredths(row.wasted_litres);
  return (available - allocated - hundredths(row.remaining_litres)) / 100;
}

export function milkShiftProduction(rows: MilkReportDistributionShift[]) {
  const totals = { morning: 0, noon: 0, evening: 0 };
  for (const row of rows) {
    if (row.milk_shift === "morning" || row.milk_shift === "noon" || row.milk_shift === "evening") {
      totals[row.milk_shift] += hundredths(row.produced_litres);
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([shift, value]) => [shift, value / 100])) as typeof totals;
}

type FinalReportRpc = <T>(name: string, args: { p_from: string; p_to: string }) => Promise<{ data: T[] | null; error: Error | null }>;
async function loadFinalReportRpc<T>(name: string, from: string, to: string): Promise<T[]> {
  const supabase = getSupabase();
  const rpc = supabase.rpc.bind(supabase) as unknown as FinalReportRpc;
  const { data, error } = await rpc<T>(name, { p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

export async function loadFinalReportKhata(from: string, to: string): Promise<FinalReportKhataRow[]> {
  const rows = await loadFinalReportRpc<FinalReportKhataRow>("final_report_khata", from, to);
  return rows.map((row) => ({
    ...row,
    litres: Number(row.litres ?? 0), opening_balance: Number(row.opening_balance ?? 0),
    opening_added: Number(row.opening_added ?? 0), charges: Number(row.charges ?? 0),
    total_payable: Number(row.total_payable ?? 0), payments: Number(row.payments ?? 0),
    discounts: Number(row.discounts ?? 0), refunds: Number(row.refunds ?? 0),
    closing_balance: Number(row.closing_balance ?? 0), receivables_due: Number(row.receivables_due ?? 0),
    customer_credits: Number(row.customer_credits ?? 0),
  }));
}

export async function loadFinalReportCashPosition(from: string, to: string): Promise<FinalReportCashPosition> {
  const [row] = await loadFinalReportRpc<FinalReportCashPosition>("final_report_cash_position", from, to);
  return {
    closing_cash_bank_balance: row?.closing_cash_bank_balance == null ? null : Number(row.closing_cash_bank_balance),
    cash_bank_account_count: Number(row?.cash_bank_account_count ?? 0),
  };
}

export async function loadFinalReportExpenseCategories(from: string, to: string): Promise<FinalReportExpenseCategory[]> {
  const rows = await loadFinalReportRpc<FinalReportExpenseCategory>("final_report_expense_categories", from, to);
  return rows.map((row) => ({ ...row, entries: Number(row.entries ?? 0), amount: Number(row.amount ?? 0) }));
}

export async function loadFinalReport(from: string, to: string): Promise<FinalReportData> {
  const [financial, daily, shifts, totals, ownerTransfers, khata, cashPosition, expenses] = await Promise.all([
    loadFinancialReport(from, to),
    loadMilkReportDistributionDaily(from, to),
    loadMilkReportDistributionShifts(from, to),
    loadMilkReportDistributionTotals(from, to),
    getOwnerTransferSummary(from, to),
    loadFinalReportKhata(from, to),
    loadFinalReportCashPosition(from, to),
    loadFinalReportExpenseCategories(from, to),
  ]);
  return { financial, milk: { daily, shifts, totals }, ownerTransfers, khata, cashPosition, expenses };
}

const milkDailyColumns = [
  "report_date", "opening_litres", "produced_litres", "available_litres", "khata_litres", "cash_litres",
  "free_litres", "farm_use_litres", "wasted_litres", "allocated_litres", "remaining_litres", "variance_litres",
  "khata_amount", "cash_sale_amount", "cash_received", "galla_cash_received",
];

export function finalReportExportSections(data: FinalReportData, from: string, to: string, generatedAt: string): PdfSection[] {
  const summary = data.financial.period.summary;
  const cashBankBalance = data.cashPosition.closing_cash_bank_balance;
  const customerRows = data.khata.filter((row) => !row.is_grand_total);
  const customerTotals = data.khata.find((row) => row.is_grand_total);
  const expenseGroups = data.expenses;
  const milk = data.milk.totals;
  const dailyRows = data.milk.daily.map((row) => ({
    report_date: row.report_date, opening_litres: row.opening_litres, produced_litres: row.produced_litres,
    available_litres: row.available_litres, khata_litres: row.khata_litres, cash_litres: row.cash_litres,
    free_litres: row.free_litres, farm_use_litres: row.farm_use_litres, wasted_litres: row.wasted_litres,
    allocated_litres: row.allocated_litres, remaining_litres: row.remaining_litres,
    variance_litres: milkReconciliationVariance(row), khata_amount: row.khata_amount,
    cash_sale_amount: row.cash_sale_amount, cash_received: row.cash_received,
    galla_cash_received: row.galla_cash_received,
  }));
  const shiftRows = data.milk.shifts.map((row) => ({
    report_date: row.report_date, milk_shift: row.milk_shift, produced_litres: row.produced_litres,
    khata_litres: row.khata_litres, cash_litres: row.cash_litres, free_litres: row.free_litres,
    farm_use_litres: row.farm_use_litres, wasted_litres: row.wasted_litres,
    allocated_litres: row.allocated_litres, remaining_litres: row.remaining_litres,
    khata_amount: row.khata_delivery_amount, cash_sale_amount: row.cash_sale_amount,
    cash_received: row.cash_received, galla_cash_received: row.galla_cash_received,
  }));
  const cashSales = data.milk.daily.filter((row) => row.cash_litres !== 0 || row.cash_sale_amount !== 0 || row.galla_cash_received !== 0);
  return [
    { title: "Report ki tafseel", columns: ["farm_name", "report_period", "generated_at"], rows: [{ farm_name: data.financial.period.farmName, report_period: `${from} se ${to} tak`, generated_at: generatedAt }] },
    { title: "Executive khulasa", columns: ["metric", "value"], rows: [
      { metric: "Kul doodh paidawar (L)", value: milk.produced_litres },
      { metric: "Doodh ki kul sales (Rs)", value: milk.total_sales_amount },
      { metric: "Local / cash sale (L)", value: milk.cash_litres },
      { metric: "Local / cash sale (Rs)", value: milk.cash_sale_amount },
      { metric: "Farm kharchay (Rs)", value: summary.farm_expenses },
      { metric: "Farm munafa / nuqsan (Rs)", value: summary.profit },
      { metric: "Customer se lena baqi (Rs)", value: customerTotals?.receivables_due ?? 0 },
      ...(cashBankBalance === null ? [] : [{ metric: "Cash / bank closing (Rs)", value: cashBankBalance }]),
    ] },
    { title: "Doodh ka stock aur reconciliation", columns: ["item", "litres"], rows: [
      { item: "Opening balance", litres: milk.opening_litres }, { item: "Nayi paidawar", litres: milk.produced_litres },
      { item: "Kul available", litres: milk.available_litres }, { item: "Khata delivery", litres: milk.khata_litres },
      { item: "Local / cash sale", litres: milk.cash_litres }, { item: "Free / khairat", litres: milk.free_litres },
      { item: "Ghar / farm istemal", litres: milk.farm_use_litres }, { item: "Zaya", litres: milk.wasted_litres },
      { item: "Kul allocated", litres: milk.allocated_litres }, { item: "Closing / baqi stock", litres: milk.closing_litres },
      { item: "Reconciliation farq", litres: milkReconciliationVariance({
        opening_litres: milk.opening_litres, produced_litres: milk.produced_litres, khata_litres: milk.khata_litres,
        cash_litres: milk.cash_litres, free_litres: milk.free_litres, farm_use_litres: milk.farm_use_litres,
        wasted_litres: milk.wasted_litres, remaining_litres: milk.closing_litres,
      }) },
    ] },
    { title: "Rozana doodh aur sales", columns: milkDailyColumns, rows: dailyRows },
    { title: "Shift-wise doodh aur distribution", columns: ["report_date", "milk_shift", "produced_litres", "khata_litres", "cash_litres", "free_litres", "farm_use_litres", "wasted_litres", "allocated_litres", "remaining_litres", "khata_amount", "cash_sale_amount", "cash_received", "galla_cash_received"], rows: shiftRows },
    { title: "Local / cash sale ki rozana tafseel", columns: ["report_date", "cash_litres", "cash_sale_amount", "cash_received", "galla_cash_received"], rows: cashSales.map((row) => ({
      report_date: row.report_date, cash_litres: row.cash_litres, cash_sale_amount: row.cash_sale_amount,
      cash_received: row.cash_received, galla_cash_received: row.galla_cash_received,
    })) },
    { title: "Customer Khata ka grand summary", columns: ["litres", "opening_balance", "opening_added", "charges", "total_payable", "payments", "discounts", "refunds", "closing_balance", "receivables_due", "customer_credits"], rows: customerTotals ? [{
      litres: customerTotals.litres, opening_balance: customerTotals.opening_balance, opening_added: customerTotals.opening_added,
      charges: customerTotals.charges, total_payable: customerTotals.total_payable, payments: customerTotals.payments,
      discounts: customerTotals.discounts, refunds: customerTotals.refunds, closing_balance: customerTotals.closing_balance,
      receivables_due: customerTotals.receivables_due, customer_credits: customerTotals.customer_credits,
    }] : [] },
    { title: "Customer-wise Khata", columns: ["customer", "litres", "opening_balance", "opening_added", "charges", "total_payable", "payments", "discounts", "refunds", "closing_balance"], rows: customerRows.map((row) => ({
      customer: row.name, litres: row.litres, opening_balance: row.opening_balance, opening_added: row.opening_added,
      charges: row.charges, total_payable: row.total_payable, payments: row.payments, discounts: row.discounts,
      refunds: row.refunds, closing_balance: row.closing_balance,
    })) },
    { title: "Owner deposits aur withdrawals", columns: ["item", "amount_rs", "entries"], rows: [
      { item: "Owner deposits", amount_rs: data.ownerTransfers.total_deposits, entries: data.ownerTransfers.deposit_count },
      { item: "Owner withdrawals", amount_rs: data.ownerTransfers.total_withdrawals, entries: data.ownerTransfers.withdrawal_count },
      { item: "Net deposits minus withdrawals", amount_rs: data.ownerTransfers.net_amount, entries: data.ownerTransfers.deposit_count + data.ownerTransfers.withdrawal_count },
    ] },
    { title: "Expense category totals", columns: ["category", "classification", "entries", "amount_rs"], rows: expenseGroups.map((row) => ({
      category: row.category, classification: row.is_farm_cost ? "Farm" : "Home / personal", entries: row.entries, amount_rs: row.amount,
    })) },
    { title: "Farm munafa / nuqsan", columns: ["line", "amount_rs"], rows: [
      { line: "Milk billing", amount_rs: summary.milk_income }, { line: "Doosri aamdani", amount_rs: summary.other_income },
      { line: "Farm kharchay", amount_rs: summary.farm_expenses }, { line: "Net munafa / nuqsan", amount_rs: summary.profit },
      { line: "Ghar / zaati kharchay, farm P&L se bahar", amount_rs: summary.home_expenses },
    ] },
    { title: "Account mein raqam ki aamad o raft", columns: ["account_name", "account_kind", "opening_balance", "money_received", "money_paid", "transfers_in", "transfers_out", "closing_balance"], rows: data.financial.accounts.map((row) => ({
      account_name: row.account_name, account_kind: row.account_kind, opening_balance: row.opening_balance,
      money_received: row.money_received, money_paid: row.money_paid, transfers_in: row.transfers_in,
      transfers_out: row.transfers_out, closing_balance: row.closing_balance,
    })) },
    { title: "Baqi tankhwah", columns: ["staff_name", "salary_month", "agreed_amount", "paid_amount", "outstanding_amount"], rows: data.financial.salaryPayables.map((row) => ({
      staff_name: row.staff_name, salary_month: row.salary_month, agreed_amount: row.agreed_amount,
      paid_amount: row.paid_amount, outstanding_amount: row.outstanding_amount,
    })) },
    { title: "Doosri aamdani ki tafseel", columns: ["income_date", "kind", "animal_tag", "amount", "note"], rows: data.financial.otherIncome.map((row) => ({
      income_date: row.income_date, kind: row.kind, animal_tag: row.animal_tag, amount: row.amount, note: row.note,
    })) },
    { title: "Kharchay ki tafseel", columns: ["expense_date", "category", "is_farm_cost", "account", "amount", "note"], rows: data.financial.period.expenses.map((row) => ({
      ...row, is_farm_cost: row.is_farm_cost ? "Farm" : "Ghar / zaati",
    })) },
  ];
}
