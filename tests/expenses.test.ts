import { expect, it, vi } from "vitest";
import { correctExpense, recordExpense } from "../src/lib/expenses";
import { getSupabase } from "../src/lib/supabase";

vi.mock("../src/lib/supabase", () => ({ getSupabase: vi.fn() }));

const input = {
  date: "2026-10-16", categoryId: "feed", accountId: "cash", amount: 125,
  note: "Feed", receivedBy: "Ali Raza",
};

it("saves the recipient with the existing expense and keeps retry idempotency exact", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  vi.mocked(getSupabase).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabase>);

  await recordExpense("expense-1", input);
  expect(from).toHaveBeenCalledWith("expenses");
  expect(insert).toHaveBeenCalledWith({
    id: "expense-1", expense_date: input.date, category_id: input.categoryId,
    account_id: input.accountId, amount: input.amount, note: input.note, received_by: "Ali Raza",
  });

  const duplicate = { code: "23505", message: "duplicate" };
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "expense-1", expense_date: input.date, category_id: input.categoryId,
      account_id: input.accountId, amount: input.amount, note: input.note, received_by: null },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const retryFrom = vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: duplicate }), select });
  vi.mocked(getSupabase).mockReturnValue({ from: retryFrom } as unknown as ReturnType<typeof getSupabase>);
  await expect(recordExpense("expense-1", input)).rejects.toBe(duplicate);
  expect(eq).toHaveBeenCalledWith("id", "expense-1");
});

it("sends recipient corrections through the audited RPC", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabase>);

  await correctExpense("expense-1", 1, "request-1", input, "Recipient was missing");
  expect(rpc).toHaveBeenCalledWith("correct_expense_with_recipient", {
    p_request_id: "request-1", p_id: "expense-1", p_revision: 1,
    p_date: input.date, p_category: input.categoryId, p_account: input.accountId,
    p_amount: input.amount, p_note: input.note, p_received_by: "Ali Raza", p_reason: "Recipient was missing",
  });
});
