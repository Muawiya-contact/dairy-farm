import type { Database } from "./database.types";
import { allRows, type Account, type ExpenseCategory } from "./farm-data";
import type { PaymentFields, PeriodFields, StaffFields } from "./salary-forms";
import { getSupabase } from "./supabase";

export type Staff = Database["public"]["Tables"]["staff"]["Row"];
export type SalaryPeriodRow = Database["public"]["Tables"]["salary_periods"]["Row"];
export type SalaryPaymentRow = Pick<Database["public"]["Tables"]["expenses"]["Row"],
  "id" | "expense_date" | "account_id" | "staff_id" | "salary_period_id" | "amount" | "note">;
export type SalaryData = {
  staff: Staff[]; periods: SalaryPeriodRow[]; payments: SalaryPaymentRow[];
  accounts: Account[]; categories: ExpenseCategory[];
};

async function allSalaryPayments(): Promise<SalaryPaymentRow[]> {
  const rows: SalaryPaymentRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from("expenses")
      .select("id,expense_date,account_id,staff_id,salary_period_id,amount,note")
      .not("salary_period_id", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function loadSalaryData(): Promise<SalaryData> {
  const [staff, periods, payments, accounts, categories] = await Promise.all([
    allRows<Staff>("staff"), allRows<SalaryPeriodRow>("salary_periods"), allSalaryPayments(),
    allRows<Account>("accounts"), allRows<ExpenseCategory>("expense_categories"),
  ]);
  return { staff, periods, payments, accounts, categories };
}

function identicalStaff(saved: Staff, fields: StaffFields): boolean {
  return saved.name === fields.name && saved.role === fields.role &&
    Number(saved.monthly_salary) === fields.monthly_salary && saved.active === fields.active;
}

export async function createStaff(id: string, fields: StaffFields): Promise<void> {
  const { error } = await getSupabase().from("staff").insert({ id, ...fields });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("staff").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || !identicalStaff(data, fields)) throw error;
}

export async function updateStaff(id: string, version: string, fields: StaffFields): Promise<void> {
  const { data, error } = await getSupabase().from("staff").update(fields)
    .eq("id", id).eq("updated_at", version).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("STAFF_STALE");
}

export async function openSalaryPeriod(id: string, fields: PeriodFields): Promise<void> {
  const { error } = await getSupabase().from("salary_periods").insert({ id, ...fields });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("salary_periods").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || data.staff_id !== fields.staff_id || data.salary_month !== fields.salary_month ||
    Number(data.agreed_amount) !== fields.agreed_amount) throw error;
}

export async function updateSalaryPeriod(id: string, previousAmount: number, agreedAmount: number): Promise<void> {
  const { data, error } = await getSupabase().from("salary_periods").update({ agreed_amount: agreedAmount })
    .eq("id", id).eq("agreed_amount", previousAmount).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SALARY_PERIOD_STALE");
}

export async function recordSalaryPayment(id: string, categoryId: string, input: PaymentFields): Promise<void> {
  const row = {
    id, expense_date: input.date, category_id: categoryId, account_id: input.accountId,
    staff_id: input.staffId, salary_period_id: input.periodId, amount: input.amount, note: input.note,
  };
  const { error } = await getSupabase().from("expenses").insert(row);
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("expenses").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || data.expense_date !== row.expense_date || data.category_id !== row.category_id ||
    data.account_id !== row.account_id || data.staff_id !== row.staff_id ||
    data.salary_period_id !== row.salary_period_id || Number(data.amount) !== row.amount ||
    data.note !== row.note) throw error;
}
