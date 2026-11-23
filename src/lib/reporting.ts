import { getSupabase } from "./supabase";
import { getSettings } from "./settings";
import { daysBetween, formatDay } from "./dates";
import { loadPagedRows } from "./paged-rows";
import { selectInactiveCustomers, type InactiveCustomer } from "./inactive-customers";

export type PeriodSummary = {
  produced: number; delivered: number; sold_litres: number; free_litres: number;
  milk_income: number; cash_collected: number; other_income: number;
  farm_expenses: number; home_expenses: number; profit: number;
};

export type PeriodCustomer = {
  customer_id: string; name: string; kind: string; sort_order: number; litres: number;
  charged: number; paid: number; discount: number; refund: number; period_balance_change: number;
};

export type PeriodExpense = {
  expense_date: string; category: string; is_farm_cost: boolean; account: string; amount: number; note: string | null;
};

export type PeriodReport = {
  summary: PeriodSummary; customers: PeriodCustomer[]; expenses: PeriodExpense[];
  farmName: string;
};

export type CustomerPeriodLedgerLine = {
  entry_date: string; entry_kind: string; detail: string; litres: number | null;
  charge: number; credit: number; payment: number; discount: number; refund: number;
  running_balance: number; reference_id: string;
};

export type CustomerPeriodLedgerSummary = {
  opening_balance: number; litres: number; charges: number; payments: number;
  discounts: number; refunds: number; closing_balance: number;
};

export type KhataPeriodCustomer = {
  customer_id: string; name: string; kind: string; active: boolean; sort_order: number;
  litres: number; charges: number; payments: number; discounts: number; refunds: number;
  opening_balance: number; opening_added: number; closing_balance: number;
};

export type KhataYearMonth = {
  month_start: string; litres: number; charges: number; payments: number; discounts: number;
  refunds: number; closing_balance: number;
};

type ReportRpc = <T>(name: string, args: { p_from: string; p_to: string }) => Promise<{ data: T[] | null; error: Error | null }>;
type MilkReportRpc<T> = (name: string, args: Record<string, unknown>) => Promise<{ data: T[] | null; error: Error | null }>;
type PagedReportRpc<T> = (name: string, args: Record<string, unknown>) => {
  range: (from: number, to: number) => Promise<{ data: T[] | null; error: Error | null }>;
};

export type MilkReportBounds = { first_date: string; last_date: string };
export type MilkReportDailyRow = {
  report_date: string; opening_litres: number; produced_litres: number; available_litres: number;
  sold_litres: number; charity_litres: number; farm_use_litres: number; wasted_litres: number; waste_reason: string | null;
  day_wasted_litres: number; day_waste_reason: string | null; closing_litres: number;
};
export type MilkReportTotals = Omit<MilkReportDailyRow, "report_date" | "waste_reason" | "day_wasted_litres" | "day_waste_reason"> & {
  sales_amount: number; received_amount: number; outstanding_amount: number;
};
export type MilkReportDistributionDetail = {
  category: string; recipient: string | null; note: string | null; litres: number;
};
export type MilkReportDistributionDaily = {
  report_date: string; opening_litres: number; produced_litres: number; available_litres: number;
  khata_litres: number; cash_litres: number; free_litres: number; farm_use_litres: number;
  wasted_litres: number; allocated_litres: number; remaining_litres: number;
  khata_delivery_amount: number; company_bill_amount: number; khata_amount: number; cash_sale_amount: number; total_sales_amount: number;
  cash_received: number; galla_cash_received: number;
  free_details: MilkReportDistributionDetail[]; farm_use_details: MilkReportDistributionDetail[]; waste_details: MilkReportDistributionDetail[];
};
export type MilkReportDistributionTotals = Omit<MilkReportDistributionDaily, "report_date" | "remaining_litres" | "free_details" | "farm_use_details" | "waste_details"> & {
  closing_litres: number; outstanding_khata_amount: number;
};
export type MilkReportDistributionShift = {
  report_date: string; milk_shift: string; opening_litres: number; produced_litres: number; available_litres: number;
  khata_litres: number; cash_litres: number; free_litres: number;
  farm_use_litres: number; wasted_litres: number; allocated_litres: number; remaining_litres: number;
  khata_delivery_amount: number; cash_sale_amount: number; cash_received: number; galla_cash_received: number;
  free_details: MilkReportDistributionDetail[]; farm_use_details: MilkReportDistributionDetail[]; waste_details: MilkReportDistributionDetail[];
};
export type MilkReportCustomer = {
  customer_id: string; name: string; kind: string; sort_order: number;
  litres: number; charged: number; paid: number; outstanding: number;
};
export type MilkReportAnimal = {
  report_date: string; animal_id: string; tag: string; name: string;
  morning_litres: number; noon_litres: number; evening_litres: number; total_litres: number;
};
export type MilkReportAnimalSummary = {
  animal_id: string | null; tag: string; name: string;
  morning_litres: number; noon_litres: number; evening_litres: number;
  total_litres: number; recorded_days: number; is_grand_total: boolean;
};
export type MilkReportAnimalOption = { id: string; tag: string; name: string | null };

const milkRpc = <T>(name: string, args: Record<string, unknown>) => {
  const supabase = getSupabase();
  return (supabase.rpc.bind(supabase) as unknown as MilkReportRpc<T>)(name, args);
};

export async function loadPagedReportRows<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
  const supabase = getSupabase();
  const rpc = supabase.rpc.bind(supabase) as unknown as PagedReportRpc<T>;
  return loadPagedRows((from, to) => rpc(name, args).range(from, to));
}

const loadPagedMilkRows = loadPagedReportRows;

export function isReportDateRange(from: string, to: string, today: string): boolean {
  try {
    formatDay(from); formatDay(to); formatDay(today);
    return from <= to && to <= today && daysBetween(from, to) <= 3660;
  } catch { return false; }
}

export async function loadMilkReportBounds(): Promise<MilkReportBounds> {
  const { data, error } = await milkRpc<MilkReportBounds>("milk_report_date_bounds", {});
  if (error) throw error;
  return data?.[0] ? { first_date: String(data[0].first_date), last_date: String(data[0].last_date) } : { first_date: "", last_date: "" };
}

export async function loadMilkReportDaily(from: string, to: string): Promise<MilkReportDailyRow[]> {
  const rows = await loadPagedMilkRows<MilkReportDailyRow>("milk_report_daily", { p_from: from, p_to: to });
  return rows.map((row) => ({ ...row, report_date: String(row.report_date), opening_litres: Number(row.opening_litres ?? 0), produced_litres: Number(row.produced_litres ?? 0), available_litres: Number(row.available_litres ?? 0), sold_litres: Number(row.sold_litres ?? 0), charity_litres: Number(row.charity_litres ?? 0), farm_use_litres: Number(row.farm_use_litres ?? 0), wasted_litres: Number(row.wasted_litres ?? 0), waste_reason: row.waste_reason ?? null, day_wasted_litres: Number(row.day_wasted_litres ?? 0), day_waste_reason: row.day_waste_reason ?? null, closing_litres: Number(row.closing_litres ?? 0) }));
}

export async function loadMilkReportTotals(from: string, to: string): Promise<MilkReportTotals> {
  const { data, error } = await milkRpc<MilkReportTotals>("milk_report_summary", { p_from: from, p_to: to });
  if (error) throw error;
  const row = data?.[0] ?? {} as MilkReportTotals;
  return {
    opening_litres: Number(row.opening_litres ?? 0), produced_litres: Number(row.produced_litres ?? 0),
    available_litres: Number(row.available_litres ?? 0), sold_litres: Number(row.sold_litres ?? 0),
    charity_litres: Number(row.charity_litres ?? 0), farm_use_litres: Number(row.farm_use_litres ?? 0), wasted_litres: Number(row.wasted_litres ?? 0),
    closing_litres: Number(row.closing_litres ?? 0), sales_amount: Number(row.sales_amount ?? 0),
    received_amount: Number(row.received_amount ?? 0), outstanding_amount: Number(row.outstanding_amount ?? 0),
  };
}

function normalizeMilkReportDistribution<T extends Record<string, unknown>>(row: T) {
  const numericFields = Object.fromEntries(Object.entries(row)
    .filter(([key]) => key.endsWith("_litres") || key.endsWith("_amount") || key.endsWith("_received"))
    .map(([key, value]) => [key, Number(value ?? 0)]));
  const details = Object.fromEntries(["free_details", "farm_use_details", "waste_details"].map((key) => [
    key,
    Array.isArray(row[key]) ? (row[key] as MilkReportDistributionDetail[]).map((detail) => ({
      ...detail, litres: Number(detail.litres ?? 0),
    })) : [],
  ]));
  return { ...row, ...numericFields, ...details };
}

export async function loadMilkReportDistributionDaily(from: string, to: string): Promise<MilkReportDistributionDaily[]> {
  const rows = await loadPagedMilkRows<MilkReportDistributionDaily>("milk_report_distribution_daily", { p_from: from, p_to: to });
  return rows.map((row) => normalizeMilkReportDistribution({ ...row, report_date: String(row.report_date) }) as MilkReportDistributionDaily);
}

export async function loadMilkReportDistributionTotals(from: string, to: string): Promise<MilkReportDistributionTotals> {
  const { data, error } = await milkRpc<MilkReportDistributionTotals>("milk_report_distribution_summary", { p_from: from, p_to: to });
  if (error) throw error;
  const row = data?.[0] ?? {} as MilkReportDistributionTotals;
  return normalizeMilkReportDistribution(row) as MilkReportDistributionTotals;
}

export async function loadMilkReportDistributionShifts(from: string, to: string): Promise<MilkReportDistributionShift[]> {
  const rows = await loadPagedMilkRows<MilkReportDistributionShift>("milk_report_distribution_shifts", { p_from: from, p_to: to });
  return rows.map((row) => normalizeMilkReportDistribution({ ...row, report_date: String(row.report_date) }) as MilkReportDistributionShift);
}

export async function loadMilkReportCustomers(from: string, to: string): Promise<MilkReportCustomer[]> {
  const { data, error } = await milkRpc<MilkReportCustomer>("milk_report_customers", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, sort_order: Number(row.sort_order ?? 0), litres: Number(row.litres ?? 0), charged: Number(row.charged ?? 0), paid: Number(row.paid ?? 0), outstanding: Number(row.outstanding ?? 0) }));
}

export async function loadMilkReportAnimals(from: string, to: string, animalId: string | null): Promise<MilkReportAnimal[]> {
  const rows = await loadPagedMilkRows<MilkReportAnimal>("milk_report_animals", { p_from: from, p_to: to, p_animal: animalId });
  return rows.map((row) => ({ ...row, report_date: String(row.report_date), morning_litres: Number(row.morning_litres ?? 0), noon_litres: Number(row.noon_litres ?? 0), evening_litres: Number(row.evening_litres ?? 0), total_litres: Number(row.total_litres ?? 0) }));
}

export async function loadMilkReportAnimalSummary(from: string, to: string, animalId: string | null): Promise<MilkReportAnimalSummary[]> {
  const { data, error } = await milkRpc<MilkReportAnimalSummary>("milk_report_animals_summary", { p_from: from, p_to: to, p_animal: animalId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, morning_litres: Number(row.morning_litres ?? 0), noon_litres: Number(row.noon_litres ?? 0), evening_litres: Number(row.evening_litres ?? 0), total_litres: Number(row.total_litres ?? 0), recorded_days: Number(row.recorded_days ?? 0), is_grand_total: Boolean(row.is_grand_total) }));
}

export async function loadMilkReportAnimalOptions(): Promise<MilkReportAnimalOption[]> {
  const { data, error } = await getSupabase().from("animals").select("id, tag, name").order("tag", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, tag: row.tag, name: row.name }));
}

export async function saveMilkDayWaste(date: string, wastedLitres: number, reason: string): Promise<void> {
  const { error } = await milkRpc<never>("save_milk_day_waste", { p_date: date, p_wasted_litres: wastedLitres, p_reason: reason });
  if (error) throw error;
}

/** A bounded server-side report avoids downloading every ledger row to the browser. */
export async function loadPeriodReport(from: string, to: string): Promise<PeriodReport> {
  // New migrations are deliberately usable before generated database types are refreshed.
  const rpc = getSupabase().rpc.bind(getSupabase()) as unknown as ReportRpc;
  const [settings, summaryResult, customers, expenses] = await Promise.all([
    getSettings(),
    rpc<PeriodSummary>("report_period_summary", { p_from: from, p_to: to }),
    loadPagedReportRows<PeriodCustomer>("report_period_customers", { p_from: from, p_to: to }),
    loadPagedReportRows<PeriodExpense>("report_period_expenses", { p_from: from, p_to: to }),
  ]);
  if (summaryResult.error) throw summaryResult.error;
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
    customers: customers.map((row) => ({ ...row, litres: Number(row.litres ?? 0), charged: Number(row.charged ?? 0), paid: Number(row.paid ?? 0), discount: Number(row.discount ?? 0), refund: Number(row.refund ?? 0), period_balance_change: Number(row.period_balance_change ?? 0) })) as PeriodCustomer[],
    expenses: expenses.map((row) => ({ ...row, amount: Number(row.amount ?? 0) })) as PeriodExpense[],
  };
}

/** The customer detail page asks the database for only this customer's chosen range. */
export async function loadCustomerPeriodLedger(customerId: string, from: string, to: string): Promise<CustomerPeriodLedgerLine[]> {
  const data = await loadPagedMilkRows<CustomerPeriodLedgerLine>("customer_period_ledger", { p_customer: customerId, p_from: from, p_to: to });
  return data.map((row) => ({ ...row, litres: row.litres == null ? null : Number(row.litres), charge: Number(row.charge ?? 0), credit: Number(row.credit ?? 0), payment: Number(row.payment ?? 0), discount: Number(row.discount ?? 0), refund: Number(row.refund ?? 0), running_balance: Number(row.running_balance ?? 0) }));
}

export async function loadCustomerPeriodLedgerSummary(customerId: string, from: string, to: string): Promise<CustomerPeriodLedgerSummary> {
  const rpc = getSupabase().rpc.bind(getSupabase()) as unknown as <T>(name: string, args: { p_customer: string; p_from: string; p_to: string }) => Promise<{ data: T[] | null; error: Error | null }>;
  const { data, error } = await rpc<CustomerPeriodLedgerSummary>("customer_period_ledger_summary", { p_customer: customerId, p_from: from, p_to: to });
  if (error) throw error;
  const row = data?.[0] ?? {} as CustomerPeriodLedgerSummary;
  return {
    opening_balance: Number(row.opening_balance ?? 0), litres: Number(row.litres ?? 0), charges: Number(row.charges ?? 0),
    payments: Number(row.payments ?? 0), discounts: Number(row.discounts ?? 0), refunds: Number(row.refunds ?? 0), closing_balance: Number(row.closing_balance ?? 0),
  };
}

export async function loadKhataPeriodSummary(from: string, to: string): Promise<KhataPeriodCustomer[]> {
  const data = await loadPagedReportRows<KhataPeriodCustomer>("khata_period_summary", { p_from: from, p_to: to });
  return data.map((row) => ({ ...row, active: Boolean(row.active), sort_order: Number(row.sort_order ?? 0), litres: Number(row.litres ?? 0), charges: Number(row.charges ?? 0), payments: Number(row.payments ?? 0), discounts: Number(row.discounts ?? 0), refunds: Number(row.refunds ?? 0), opening_balance: Number(row.opening_balance ?? 0), opening_added: Number(row.opening_added ?? 0), closing_balance: Number(row.closing_balance ?? 0) }));
}

export async function loadInactiveCustomers(from: string, to: string): Promise<InactiveCustomer[]> {
  const supabase = getSupabase();
  type CustomerRecord = Omit<InactiveCustomer, "customer_id"> & { id: string };
  type CustomerPage = {
    range: (start: number, end: number) => Promise<{ data: CustomerRecord[] | null; error: Error | null }>;
  };
  const loadCustomers = (start: number, end: number) => (supabase.from("customers")
    .select("id,name,phone,kind,active,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true }) as unknown as CustomerPage).range(start, end);
  const [customers, periodRows] = await Promise.all([
    loadPagedRows<CustomerRecord>(loadCustomers),
    loadKhataPeriodSummary(from, to),
  ]);
  return selectInactiveCustomers(customers.map(({ id, ...customer }) => ({ ...customer, customer_id: id })), periodRows);
}

export async function loadKhataYearMonthSummary(year: number): Promise<KhataYearMonth[]> {
  const rpc = getSupabase().rpc.bind(getSupabase()) as unknown as <T>(name: string, args: { p_year: number }) => Promise<{ data: T[] | null; error: Error | null }>;
  const { data, error } = await rpc<KhataYearMonth>("khata_year_month_summary", { p_year: year });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, litres: Number(row.litres ?? 0), charges: Number(row.charges ?? 0), payments: Number(row.payments ?? 0), discounts: Number(row.discounts ?? 0), refunds: Number(row.refunds ?? 0), closing_balance: Number(row.closing_balance ?? 0) }));
}
