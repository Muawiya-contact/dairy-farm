import { getSupabase } from "./supabase";
import type { ExpenseInput } from "./expense-forms";

/** Keep the same ID while retrying an uncertain save to avoid a second expense. */
export async function recordExpense(id: string, input: ExpenseInput): Promise<void> {
  const row = {
    id, expense_date: input.date, category_id: input.categoryId,
    account_id: input.accountId, amount: input.amount, note: input.note,
  };
  const { error } = await getSupabase().from("expenses").insert(row);
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { data, error: lookupError } = await getSupabase().from("expenses").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!data || data.expense_date !== input.date || data.category_id !== input.categoryId ||
      data.account_id !== input.accountId || Number(data.amount) !== input.amount || data.note !== input.note) throw error;
}

export async function correctExpense(id: string, revision: number, requestId: string,
  input: ExpenseInput, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc("correct_expense", {
    p_request_id: requestId, p_id: id, p_revision: revision,
    p_date: input.date, p_category: input.categoryId, p_account: input.accountId,
    p_amount: input.amount, p_note: input.note, p_reason: reason,
  });
  if (error) throw error;
}

export async function getExpenseAudit(expenseId: string) {
  const { data, error } = await getSupabase().from("expense_audit").select("*")
    .eq("expense_id", expenseId).order("changed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
