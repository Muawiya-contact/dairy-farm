import { getSupabase } from "./supabase";
import {
  loadKhataPeriodSummary, loadPeriodReport,
  type KhataPeriodCustomer, type PeriodReport,
} from "./reporting";
import type { Database } from "./database.types";
import type { PdfSection } from "./export-data";

export type FinancialCashAccount = Database["public"]["Functions"]["financial_report_cashflow"]["Returns"][number];
export type FinancialSalaryPayable = Database["public"]["Functions"]["financial_report_salary_payables"]["Returns"][number];
export type FinancialIncomeRow = Database["public"]["Functions"]["financial_report_income_rows"]["Returns"][number];
export type FinancialTrend = Database["public"]["Functions"]["financial_report_trends"]["Returns"][number];

export type FinancialReportData = {
  period: PeriodReport;
  customers: KhataPeriodCustomer[];
  accounts: FinancialCashAccount[];
  salaryPayables: FinancialSalaryPayable[];
  otherIncome: FinancialIncomeRow[];
  trends: FinancialTrend[];
};

export type FinancialLedgerEntry = {
  entry_date: string;
  entry_kind: string;
  description: string;
  money_in: number;
  money_out: number;
  ref_id: string;
};

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<{ data: T[] | null; error: Error | null }>;
function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T[] | null; error: Error | null }> {
  const supabase = getSupabase();
  return (supabase.rpc.bind(supabase) as unknown as Rpc)<T>(name, args);
}

function normalizeNumbers<T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]): T[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key, keys.includes(key as keyof T) ? Number(value ?? 0) : value,
  ])) as T);
}

async function loadOtherIncome(from: string, to: string): Promise<FinancialIncomeRow[]> {
  const rows: FinancialIncomeRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await rpc<FinancialIncomeRow>("financial_report_income_rows", {
      p_from: from, p_to: to, p_limit: pageSize, p_offset: offset,
    });
    if (error) throw error;
    const page = (data ?? []).map((row) => ({ ...row, amount: Number(row.amount ?? 0) }));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadFinancialReport(from: string, to: string): Promise<FinancialReportData> {
  const [period, customers, accountsResult, salaryResult, otherIncome, trendsResult] = await Promise.all([
    loadPeriodReport(from, to),
    loadKhataPeriodSummary(from, to),
    rpc<FinancialCashAccount>("financial_report_cashflow", { p_from: from, p_to: to }),
    rpc<FinancialSalaryPayable>("financial_report_salary_payables", { p_as_of: to }),
    loadOtherIncome(from, to),
    rpc<FinancialTrend>("financial_report_trends", { p_from: from, p_to: to }),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (salaryResult.error) throw salaryResult.error;
  if (trendsResult.error) throw trendsResult.error;
  return {
    period,
    customers,
    accounts: normalizeNumbers((accountsResult.data ?? []) as unknown as Record<string, unknown>[],
      ["opening_balance", "money_received", "money_paid", "transfers_in", "transfers_out", "closing_balance", "opening_amount"] as (keyof Record<string, unknown>)[]) as unknown as FinancialCashAccount[],
    salaryPayables: normalizeNumbers((salaryResult.data ?? []) as unknown as Record<string, unknown>[],
      ["agreed_amount", "paid_amount", "outstanding_amount"] as (keyof Record<string, unknown>)[]) as unknown as FinancialSalaryPayable[],
    otherIncome,
    trends: normalizeNumbers((trendsResult.data ?? []) as unknown as Record<string, unknown>[],
      ["milk_income", "other_income", "customer_collections", "farm_expenses", "home_expenses", "total_income", "net_profit", "cash_received", "cash_paid"] as (keyof Record<string, unknown>)[]) as unknown as FinancialTrend[],
  };
}

export async function loadFinancialAccountLedger(
  accountId: string, from: string, to: string, account: FinancialCashAccount,
): Promise<FinancialLedgerEntry[]> {
  const supabase = getSupabase();
  type LedgerQuery = {
    gte: (column: string, value: string) => LedgerQuery;
    lte: (column: string, value: string) => LedgerQuery;
    order: (column: string, options?: { ascending?: boolean }) => LedgerQuery;
    range: (from: number, to: number) => Promise<{ data: FinancialLedgerEntry[] | null; error: Error | null }>;
  };
  const ledgerRpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: { p_account: string }) => LedgerQuery;
  const entries: FinancialLedgerEntry[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await ledgerRpc("account_entries", { p_account: accountId })
      .gte("entry_date", from).lte("entry_date", to)
      .order("entry_date").order("ref_id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []).map((row) => ({
      ...row, money_in: Number(row.money_in ?? 0), money_out: Number(row.money_out ?? 0),
    }));
    entries.push(...page);
    if (page.length < pageSize) break;
  }

  if (account.opening_amount !== 0) {
    entries.push({
      entry_date: account.opening_date,
      entry_kind: "opening_balance",
      description: "Account ka shuru ka baqaya",
      money_in: Math.max(account.opening_amount, 0),
      money_out: Math.max(-account.opening_amount, 0),
      ref_id: `opening-${account.account_id}`,
    });
  }
  return entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date)
    || (a.entry_kind === "opening_balance" ? -1 : b.entry_kind === "opening_balance" ? 1 : a.ref_id.localeCompare(b.ref_id)));
}

export function receivableTotals(customers: KhataPeriodCustomer[]) {
  return customers.reduce((totals, customer) => ({
    due: totals.due + Math.max(customer.closing_balance, 0),
    customerCredits: totals.customerCredits + Math.max(-customer.closing_balance, 0),
  }), { due: 0, customerCredits: 0 });
}

export function salaryPayableTotal(rows: FinancialSalaryPayable[]): number {
  return rows.reduce((total, row) => total + Math.max(row.outstanding_amount, 0), 0);
}

export function accountCashflowReconciles(account: FinancialCashAccount): boolean {
  const calculated = account.opening_balance + account.money_received - account.money_paid
    + account.transfers_in - account.transfers_out;
  return Math.abs(Math.round(calculated * 100) - Math.round(account.closing_balance * 100)) <= 1;
}

const incomeLabels: Record<string, string> = {
  animal_sale: "Janwar ki farokht",
  manure: "Gobar ki farokht",
  other: "Doosri darj aamdani",
};

export function groupOtherIncome(rows: FinancialIncomeRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.kind, (totals.get(row.kind) ?? 0) + row.amount);
  return [...totals.entries()].map(([kind, amount]) => ({
    kind, label: incomeLabels[kind] ?? "Darj aamdani", amount,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export function groupFinancialExpenses(rows: PeriodReport["expenses"]) {
  const totals = new Map<string, { category: string; classification: string; amount: number; entries: number }>();
  for (const row of rows) {
    const classification = row.is_farm_cost ? "Farm" : "Home / personal";
    const key = `${classification}:${row.category}`;
    const current = totals.get(key) ?? { category: row.category, classification, amount: 0, entries: 0 };
    current.amount += row.amount;
    current.entries += 1;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export function financialReportExportSections(
  data: FinancialReportData,
  accountEntries: FinancialLedgerEntry[],
  from: string,
  to: string,
  generatedAt: string,
): PdfSection[] {
  const summary = data.period.summary;
  const incomeGroups = groupOtherIncome(data.otherIncome);
  const expenseGroups = groupFinancialExpenses(data.period.expenses);
  const pnlIncome = summary.milk_income + summary.other_income;
  return [
    { title: "Report ki tafseel", columns: ["farm_name", "report_period", "generated_at"], rows: [{
      farm_name: data.period.farmName, report_period: `${from} se ${to} tak`, generated_at: generatedAt,
    }] },
    { title: "Maali khulasa", columns: ["metric", "amount_rs"], rows: [
      { metric: "Farm ki kul aamdani", amount_rs: pnlIncome },
      { metric: "Wapsi minus kar ke customer se wasooli", amount_rs: summary.cash_collected },
      { metric: "Doosri darj aamdani", amount_rs: summary.other_income },
      { metric: "Ghar / zaati samait kul kharchay", amount_rs: summary.farm_expenses + summary.home_expenses },
      { metric: "Farm ka munafa / nuqsan", amount_rs: summary.profit },
      { metric: "Muddat ke aakhir mein customer ka baqaya", amount_rs: receivableTotals(data.customers).due },
      { metric: "Muddat ke aakhir mein customer ka advance", amount_rs: receivableTotals(data.customers).customerCredits },
      { metric: "Muddat ke aakhir mein baqi tankhwah", amount_rs: salaryPayableTotal(data.salaryPayables) },
    ] },
    { title: "Aamdani ke zariye", columns: ["source", "amount_rs"], rows: [
      { source: "Doodh ki delivery aur company bill (bill shuda)", amount_rs: summary.milk_income },
      ...incomeGroups.map((row) => ({ source: row.label, amount_rs: row.amount })),
    ] },
    { title: "Darj qism ke mutabiq kharchay", columns: ["category", "classification", "entries", "amount_rs"], rows: expenseGroups.map((row) => ({
      ...row, classification: row.classification === "Farm" ? "Farm" : "Ghar / zaati",
    })) },
    { title: "Aamdani aur kharcha", columns: ["line", "amount_rs", "treatment"], rows: [
      { line: "Doodh ki delivery aur company bill", amount_rs: summary.milk_income, treatment: "Bill shuda aamdani" },
      { line: "Doosri darj aamdani", amount_rs: summary.other_income, treatment: "Darj aamdani" },
      { line: "Farm ke rozmarra kharchay", amount_rs: -summary.farm_expenses, treatment: "Kharchay ke ledger se; linked raqam aik hi martaba gini gayi" },
      { line: "Farm ka net munafa / nuqsan", amount_rs: summary.profit, treatment: "Report ke aamdani aur kharchay ke hisaab se; ghar / zaati kharchay shamil nahi" },
      { line: "Ghar / zaati kharchay (alag)", amount_rs: summary.home_expenses, treatment: "Alag dikhaye gaye; farm munafay mein shamil nahi" },
    ] },
    { title: "Account mein raqam ki aamad o raft", columns: ["account_name", "account_kind", "opening_balance", "money_received", "money_paid", "transfers_in", "transfers_out", "closing_balance"], rows: data.accounts.map((row) => ({
      account_name: row.account_name, account_kind: ({ cash: "Cash", bank: "Bank", person: "Zaati account" } as Record<string, string>)[row.account_kind] ?? row.account_kind, opening_balance: row.opening_balance,
      money_received: row.money_received, money_paid: row.money_paid, transfers_in: row.transfers_in,
      transfers_out: row.transfers_out, closing_balance: row.closing_balance,
    })) },
    { title: "Customer ka baqaya", columns: ["customer", "opening_balance", "opening_added", "charges", "payments", "discounts", "refunds", "closing_balance"], rows: data.customers.map((row) => ({
      customer: row.name, opening_balance: row.opening_balance, opening_added: row.opening_added,
      charges: row.charges, payments: row.payments, discounts: row.discounts, refunds: row.refunds,
      closing_balance: row.closing_balance,
    })) },
    { title: "Baqi tankhwah", columns: ["staff_name", "salary_month", "agreed_amount", "paid_amount", "outstanding_amount"], rows: data.salaryPayables.map((row) => ({
      staff_name: row.staff_name, salary_month: row.salary_month, agreed_amount: row.agreed_amount,
      paid_amount: row.paid_amount, outstanding_amount: row.outstanding_amount,
    })) },
    { title: "Maali rujhan", columns: ["bucket_start", "total_income", "farm_expenses", "home_expenses", "net_profit", "customer_collections", "cash_received", "cash_paid"], rows: data.trends.map((row) => ({
      bucket_start: row.bucket_start, total_income: row.total_income, farm_expenses: row.farm_expenses,
      home_expenses: row.home_expenses, net_profit: row.net_profit, customer_collections: row.customer_collections,
      cash_received: row.cash_received, cash_paid: row.cash_paid,
    })) },
    { title: "Doosri aamdani ki tafseel", columns: ["income_date", "kind", "animal_tag", "amount", "note"], rows: data.otherIncome.map((row) => ({
      income_date: row.income_date, kind: incomeLabels[row.kind] ?? "Darj aamdani", animal_tag: row.animal_tag,
      amount: row.amount, note: row.note,
    })) },
    { title: "Customer ke bill aur wasooli", columns: ["customer", "litres", "charged", "paid", "discount", "refund", "period_balance_change"], rows: data.period.customers.map((row) => ({
      customer: row.name, litres: row.litres, charged: row.charged, paid: row.paid,
      discount: row.discount, refund: row.refund, period_balance_change: row.period_balance_change,
    })) },
    { title: "Kharchay ki tafseel", columns: ["expense_date", "category", "is_farm_cost", "account", "amount", "note"], rows: data.period.expenses.map((row) => ({
      ...row, is_farm_cost: row.is_farm_cost ? "Farm" : "Ghar / zaati",
    })) },
    { title: "Chunay huay account ka ledger", columns: ["entry_date", "entry_kind", "description", "money_in", "money_out", "ref_id"], rows: accountEntries.map((entry) => ({
      ...entry, entry_kind: ({ opening_balance: "Shuru ka balance", payment: "Wusooli", other_income: "Doosri aamdani", transfer_in: "Account mein transfer", transfer_out: "Account se transfer", expense: "Kharcha" } as Record<string, string>)[entry.entry_kind] ?? entry.entry_kind,
    })) },
    { title: "Hisaab ki hudood", columns: ["item", "details"], rows: [
      { item: "Supplier ka baqaya", details: "Yahan nahi dikhaya: app supplier ka alag udhaar ledger darj nahi karti." },
      { item: "Har litre ka kharcha", details: "Yahan nahi dikhaya: farm kharchay ko doodh ki paidawar mein baantne ka muqarrar tareeqa nahi." },
    ] },
  ];
}

export function flattenFinancialExport(sections: PdfSection[]) {
  const columns = ["section", ...new Set(sections.flatMap((section) => section.columns))];
  const rows = sections.flatMap((section) => section.rows.map((row) => ({ section: section.title, ...row })));
  return { columns, rows };
}
