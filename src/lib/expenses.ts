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
