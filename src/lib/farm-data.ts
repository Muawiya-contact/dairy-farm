"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "./supabase";
import { getSettings, type FarmSettings } from "./settings";

export type Animal = {
  id: string; tag: string; name: string | null; species: "cow" | "buffalo";
  breed: string | null; sex: "female" | "male"; category: "cow" | "heifer" | "calf" | "bull";
  birth_date: string | null; mother_id: string | null; purchase_date: string | null;
  purchase_price: number | null; milking_status: "milking" | "dry" | "none";
  life_status: "active" | "sold" | "dead"; notes: string | null;
};
export type AnimalStatus = { id: string; breeding_status: string; service_date: string | null; calving_due: string | null };
export type HealthEvent = { id: string; animal_id: string; event_date: string; kind: string; title: string; notes: string | null; cost: number; next_due_date: string | null };
export type Insemination = { id: string; animal_id: string; service_date: string; semen_name: string | null; status: string; calving_due: string | null };
export type AnimalMilk = { id: string; shift_id: string; animal_id: string; litres: number };
export type Customer = { id: string; name: string; phone: string | null; kind: string; default_morning: number; default_evening: number; opening_balance: number; opening_date: string; active: boolean; sort_order: number };
export type CustomerRate = { id: string; customer_id: string; rate: number; effective_from: string };
export type MilkShift = { id: string; milk_date: string; shift: "morning" | "evening"; total_litres: number; mode: "total" | "per_animal" };
export type MilkDelivery = { id: string; delivery_date: string; shift: "morning" | "evening"; customer_id: string; litres: number; rate: number | null; amount: number };
export type Payment = { id: string; customer_id: string; payment_date: string; amount: number; kind: string; method: string | null; account_id: string | null };
export type ExpenseCategory = { id: string; name: string; is_farm_cost: boolean; active: boolean; sort_order: number };
export type Expense = { id: string; expense_date: string; category_id: string; amount: number; account_id: string; note: string | null };
export type Account = { id: string; name: string; is_farm_cash: boolean; active: boolean };
export type CompanyBill = { id: string; customer_id: string; to_date: string; amount: number };
export type OtherIncome = { id: string; income_date: string; amount: number };
export type CustomerReport = { customer_id: string; name: string; kind: string; litres: number; amount: number; previous_balance: number; paid: number; discount: number; balance: number };
export type CustomerBalance = { customer_id: string; balance: number };
export type HerdAlert = { alert_kind: string; severity: string; due_date: string; animal_id: string; tag: string; message: string };
export type Pnl = { milk_income: number; other_income: number; total_income: number; farm_expenses: number; personal_expenses: number; profit: number };

export type FarmData = {
  today: string; settings: FarmSettings; animals: Animal[]; animalStatus: AnimalStatus[];
  health: HealthEvent[]; inseminations: Insemination[]; animalMilk: AnimalMilk[];
  customers: Customer[]; rates: CustomerRate[]; shifts: MilkShift[]; deliveries: MilkDelivery[];
  payments: Payment[]; categories: ExpenseCategory[]; expenses: Expense[]; accounts: Account[];
  companyBills: CompanyBill[]; otherIncome: OtherIncome[]; reports: CustomerReport[];
  balances: CustomerBalance[]; alerts: HerdAlert[]; monthlyPnl: { month: string; data: Pnl }[];
};

export const money = (value: number | null | undefined) => `Rs ${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
export const amount = (value: number | string | null | undefined) => Number(value) || 0;
export const farmToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (kind: string) => parts.find((p) => p.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function allRows<T>(table: string, key = "id"): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from(table).select("*").order(key).range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return result;
  }
}

async function report<T>(name: string, args: Record<string, string>): Promise<T[]> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function loadFarmData(): Promise<FarmData> {
  const today = farmToday();
  const months = Array.from({ length: Number(today.slice(5, 7)) }, (_, i) => `${today.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`);
  const [settings, animals, animalStatus, health, inseminations, animalMilk,
    customers, rates, shifts, deliveries, payments, categories, expenses, accounts,
    companyBills, otherIncome, reports, balances, alerts, pnl] = await Promise.all([
    getSettings(), allRows<Animal>("animals"), allRows<AnimalStatus>("animal_status"),
    allRows<HealthEvent>("health_events"), allRows<Insemination>("inseminations"),
    allRows<AnimalMilk>("animal_milk"), allRows<Customer>("customers"),
    allRows<CustomerRate>("customer_rates"), allRows<MilkShift>("milk_shifts"),
    allRows<MilkDelivery>("milk_deliveries"), allRows<Payment>("payments"),
    allRows<ExpenseCategory>("expense_categories"), allRows<Expense>("expenses"),
    allRows<Account>("accounts"), allRows<CompanyBill>("company_bills"),
    allRows<OtherIncome>("other_income"), report<CustomerReport>("customer_month_report", { p_month: today }),
    allRows<CustomerBalance>("customer_balances", "customer_id"), report<HerdAlert>("herd_alerts", { p_today: today }),
    Promise.all(months.map(async (month) => ({ month, data: (await report<Pnl>("pnl_month", { p_month: month }))[0] }))),
  ]);
  return { today, settings, animals, animalStatus, health, inseminations, animalMilk,
    customers, rates, shifts, deliveries, payments, categories, expenses, accounts,
    companyBills, otherIncome, reports, balances, alerts, monthlyPnl: pnl };
}

export function useFarmData() {
  return useQuery({ queryKey: ["farm-data"], queryFn: loadFarmData, staleTime: 15_000 });
}

export function customerRate(data: FarmData, id: string): number {
  return amount(data.rates.filter((r) => r.customer_id === id && r.effective_from <= data.today)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.rate);
}

export async function saveMilkEntry(input: { date: string; shift: "morning" | "evening"; total: number; mode: "total" | "per_animal"; animals: { animal_id: string; litres: number }[]; deliveries: { customer_id: string; litres: number }[] }) {
  const { error } = await getSupabase().rpc("save_milk_entry", {
    p_date: input.date, p_shift: input.shift, p_total: input.total, p_mode: input.mode,
    p_animals: input.animals, p_deliveries: input.deliveries,
  });
  if (error) throw error;
}

export async function insertRow(table: string, value: Record<string, unknown>) {
  const { error } = await getSupabase().from(table).insert(value);
  if (error) throw error;
}

export async function createCustomer(input: { name: string; kind: string; phone: string; morning: number; evening: number; rate: number }) {
  const { error } = await getSupabase().rpc("create_customer", {
    p_name: input.name, p_kind: input.kind, p_phone: input.phone,
    p_morning: input.morning, p_evening: input.evening, p_rate: input.rate,
  });
  if (error) throw error;
}
