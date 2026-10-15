"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "./supabase";
import { getSettings, type FarmSettings } from "./settings";
import { formatDay, todayPK } from "./dates";
import { rs } from "./format";
import type { CustomerPayment, CustomerProfile, NewCustomer } from "./customer-forms";
import type { Database } from "./database.types";

export type Animal = {
  id: string; tag: string; name: string | null; species: "cow" | "buffalo";
  breed: string | null; sex: "female" | "male"; category: "cow" | "heifer" | "calf" | "bull";
  birth_date: string | null; arrival_date: string | null; estimated_age_months_at_arrival: number | null;
  mother_id: string | null; purchase_date: string | null;
  purchase_price: number | null; source: "born" | "purchased" | "gift" | "transfer" | "other"; sire: string | null;
  milking_status: "milking" | "dry" | "none";
  life_status: "active" | "sold" | "dead" | "removed"; exit_date: string | null;
  exit_reason: string | null; sale_price: number | null; notes: string | null;
  updated_at: string;
};
export type AnimalStatus = { id: string; breeding_status: string; service_date: string | null; calving_due: string | null };
export type HealthEvent = { id: string; animal_id: string; event_date: string; kind: string; title: string; notes: string | null; cost: number; next_due_date: string | null };
export type Insemination = Database["public"]["Tables"]["inseminations"]["Row"];
export type Calving = Database["public"]["Tables"]["calvings"]["Row"];
export type AnimalMilk = { id: string; shift_id: string; animal_id: string; litres: number };
export type Customer = { id: string; name: string; phone: string | null; kind: string; default_morning: number; default_evening: number; opening_balance: number; opening_date: string; active: boolean; sort_order: number };
export type CustomerRate = { id: string; customer_id: string; rate: number; effective_from: string };
export type MilkShift = { id: string; milk_date: string; shift: "morning" | "evening"; total_litres: number; mode: "total" | "per_animal" };
export type MilkDelivery = { id: string; delivery_date: string; shift: "morning" | "evening"; customer_id: string; litres: number; rate: number | null; amount: number };
export type Payment = { id: string; customer_id: string; payment_date: string; amount: number; kind: string; method: string | null; account_id: string | null; delivery_id: string | null; note: string | null; revision: number };
export type ExpenseCategory = { id: string; name: string; is_farm_cost: boolean; is_salary: boolean; active: boolean; sort_order: number };
export type Expense = { id: string; expense_date: string; category_id: string; amount: number; account_id: string; note: string | null };
export type Account = { id: string; name: string; kind: string; is_farm_cash: boolean; active: boolean; opening_date: string };
export type CompanyBill = { id: string; customer_id: string; from_date: string; to_date: string; litres: number; amount: number };
export type OtherIncome = { id: string; income_date: string; amount: number };
export type CustomerReport = { customer_id: string; name: string; kind: string; litres: number; amount: number; previous_balance: number; paid: number; discount: number; balance: number };
export type CustomerBalance = { customer_id: string; balance: number };
export type HerdAlert = { alert_kind: string; severity: string; due_date: string; animal_id: string; tag: string; message: string };
export type Pnl = { milk_income: number; other_income: number; total_income: number; farm_expenses: number; personal_expenses: number; profit: number };

export type FarmData = {
  today: string; settings: FarmSettings; animals: Animal[]; animalStatus: AnimalStatus[];
  health: HealthEvent[]; inseminations: Insemination[]; calvings: Calving[]; animalMilk: AnimalMilk[];
  customers: Customer[]; rates: CustomerRate[]; shifts: MilkShift[]; deliveries: MilkDelivery[];
  payments: Payment[]; categories: ExpenseCategory[]; expenses: Expense[]; accounts: Account[];
  companyBills: CompanyBill[]; otherIncome: OtherIncome[]; reports: CustomerReport[];
  balances: CustomerBalance[]; alerts: HerdAlert[]; monthlyPnl: { month: string; data: Pnl }[];
};

export const money = (value: number | null | undefined) => rs(Number(value) || 0);
export const amount = (value: number | string | null | undefined) => Number(value) || 0;
export const farmToday = todayPK;
export const shortDate = (iso: string) => formatDay(iso).replace(/ \d{4}$/, "");
export const longDate = formatDay;

type Table = keyof Database["public"]["Tables"];
type View = keyof Database["public"]["Views"];
type Report = "customer_month_report" | "herd_alerts" | "pnl_month";

export async function allRows<T>(table: Table, key = "id"): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from(table).select("*").order(key).range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return result;
  }
}

async function allViewRows<T>(view: View, key: string): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from(view).select("*").order(key).range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return result;
  }
}

async function report<T>(name: Report, args: Record<string, string>): Promise<T[]> {
  const { data, error } = await getSupabase().rpc(name, args as { p_month: string; p_today: string });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function loadFarmData(): Promise<FarmData> {
  const today = farmToday();
  const months = Array.from({ length: Number(today.slice(5, 7)) }, (_, i) => `${today.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`);
  const [settings, animals, animalStatus, health, inseminations, calvings, animalMilk,
    customers, rates, shifts, deliveries, payments, categories, expenses, accounts,
    companyBills, otherIncome, reports, balances, alerts, pnl] = await Promise.all([
    getSettings(), allRows<Animal>("animals"), allViewRows<AnimalStatus>("animal_status", "id"),
    allRows<HealthEvent>("health_events"), allRows<Insemination>("inseminations"), allRows<Calving>("calvings"),
    allRows<AnimalMilk>("animal_milk"), allRows<Customer>("customers"),
    allRows<CustomerRate>("customer_rates"), allRows<MilkShift>("milk_shifts"),
    allRows<MilkDelivery>("milk_deliveries"), allRows<Payment>("payments"),
    allRows<ExpenseCategory>("expense_categories"), allRows<Expense>("expenses"),
    allRows<Account>("accounts"), allRows<CompanyBill>("company_bills"),
    allRows<OtherIncome>("other_income"), report<CustomerReport>("customer_month_report", { p_month: today }),
    allViewRows<CustomerBalance>("customer_balances", "customer_id"), report<HerdAlert>("herd_alerts", { p_today: today }),
    Promise.all(months.map(async (month) => ({ month, data: (await report<Pnl>("pnl_month", { p_month: month }))[0] }))),
  ]);
  return { today, settings, animals, animalStatus, health, inseminations, calvings, animalMilk,
    customers, rates, shifts, deliveries, payments, categories, expenses, accounts,
    companyBills, otherIncome, reports, balances, alerts, monthlyPnl: pnl };
}

export function useFarmData() {
  return useQuery({ queryKey: ["farm-data"], queryFn: loadFarmData, staleTime: 15_000 });
}

export function customerRate(data: Pick<FarmData, "rates" | "today">, id: string, onDate = data.today): number {
  return amount(data.rates.filter((r) => r.customer_id === id && r.effective_from <= onDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.rate);
}

/** Keep old deliveries visible when a customer is later made inactive. */
export function milkShiftCustomers(data: Pick<FarmData, "customers" | "deliveries">, date: string, shift: "morning" | "evening"): Customer[] {
  const historical = new Set(data.deliveries.filter((row) => row.delivery_date === date && row.shift === shift).map((row) => row.customer_id));
  return data.customers.filter((customer) => customer.active || historical.has(customer.id));
}

/** An old shift still needs animals that were milking then, even if they are now dry or sold. */
export function milkShiftAnimals(data: Pick<FarmData, "animals" | "animalMilk">, shiftId: string | undefined): Animal[] {
  const historical = new Set(data.animalMilk.filter((row) => row.shift_id === shiftId).map((row) => row.animal_id));
  return data.animals.filter((animal) =>
    (animal.life_status === "active" && animal.sex === "female" && animal.milking_status === "milking") || historical.has(animal.id));
}

export async function saveMilkEntry(input: { date: string; shift: "morning" | "evening"; total: number; mode: "total" | "per_animal"; animals: { animal_id: string; litres: number }[]; deliveries: { customer_id: string; litres: number }[] }) {
  const { error } = await getSupabase().rpc("save_milk_entry", {
    p_date: input.date, p_shift: input.shift, p_total: input.total, p_mode: input.mode,
    p_animals: input.animals, p_deliveries: input.deliveries,
  });
  if (error) throw error;
}

type InsertValue<K extends Table> = K extends "inseminations"
  ? Omit<Database["public"]["Tables"]["inseminations"]["Insert"], "calving_due" | "checkup_due" | "dry_off_due" | "ultrasound_due">
  : Database["public"]["Tables"][K]["Insert"];

export async function insertRow<K extends Table>(table: K, value: InsertValue<K>) {
  const { error } = await getSupabase().from(table).insert(value as never);
  if (error) throw error;
}

export async function updateAnimal(id: string, version: string, value: Database["public"]["Tables"]["animals"]["Update"]) {
  const { data, error } = await getSupabase().from("animals").update(value).eq("id", id).eq("life_status", "active").eq("updated_at", version).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("ANIMAL_STALE");
}

export async function closeAnimal(input: {
  animalId: string; status: "sold" | "dead" | "removed"; date: string; reason: string;
  price: number | null; accountId: string | null;
}) {
  const args = {
    p_animal_id: input.animalId, p_status: input.status, p_exit_date: input.date,
    p_reason: input.reason, p_sale_price: input.price, p_account_id: input.accountId,
  };
  // Typegen marks nullable PostgreSQL function arguments as required strings/numbers.
  const { error } = await getSupabase().rpc("close_animal", args as unknown as Database["public"]["Functions"]["close_animal"]["Args"]);
  if (error) throw error;
}

export async function createCustomer(input: NewCustomer) {
  const { error } = await getSupabase().rpc("create_customer", {
    p_name: input.name, p_kind: input.kind, p_phone: input.phone,
    p_morning: input.morning, p_evening: input.evening, p_rate: input.rate,
    p_opening_balance: input.openingBalance, p_opening_date: input.openingDate,
  });
  if (error) throw error;
}

export async function updateCustomerProfile(id: string, input: CustomerProfile): Promise<void> {
  const { data, error } = await getSupabase().from("customers").update({
    name: input.name, phone: input.phone || null,
    default_morning: input.morning, default_evening: input.evening, active: input.active,
  }).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CUSTOMER_STALE");
}

export async function recordCustomerPayment(customerId: string, input: CustomerPayment, id = crypto.randomUUID()): Promise<void> {
  const { error } = await getSupabase().from("payments").insert({
    id, customer_id: customerId, payment_date: input.date, amount: input.amount,
    kind: "payment", method: input.method, account_id: input.accountId,
  });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("payments").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || data.customer_id !== customerId || data.payment_date !== input.date ||
      Number(data.amount) !== input.amount || data.kind !== "payment" || data.method !== input.method ||
      data.account_id !== input.accountId) throw error;
}

export async function customerMonthReport(customerId: string, month: string): Promise<CustomerReport | null> {
  const { data, error } = await getSupabase().rpc("customer_month_report", { p_month: `${month}-01` })
    .eq("customer_id", customerId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCustomerRate(customerId: string, rate: number, effectiveFrom: string) {
  const { error } = await getSupabase().from("customer_rates").upsert(
    { customer_id: customerId, rate, effective_from: effectiveFrom },
    { onConflict: "customer_id,effective_from" },
  );
  if (error) throw error;
}

export async function recordHealthEvent(input: {
  animalId: string; date: string; kind: string; title: string;
  cost: number; nextDueDate: string | null; categoryId: string | null; accountId: string | null;
}) {
  const args = {
    p_animal_id: input.animalId, p_event_date: input.date, p_kind: input.kind,
    p_title: input.title, p_cost: input.cost, p_next_due_date: input.nextDueDate,
    p_category_id: input.categoryId, p_account_id: input.accountId,
  };
  // PostgreSQL accepts NULL for optional event details, although typegen marks RPC args as strings.
  const { error } = await getSupabase().rpc("record_health_event", args as unknown as Database["public"]["Functions"]["record_health_event"]["Args"]);
  if (error) throw error;
}
