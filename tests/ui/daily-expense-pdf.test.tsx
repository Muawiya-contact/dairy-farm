import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { farmMocks, fixtures, makeFarmData, renderWithQuery } from "./utils";
import FarmExpenses from "@/components/FarmExpenses";

const documentMocks = vi.hoisted(() => ({ buildPdf: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), ...documentMocks }));

beforeEach(() => {
  documentMocks.buildPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  documentMocks.downloadBlob.mockReset();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    settings: { farm_name: "Saim Dairy Farm" },
    categories: [{ id: "farm", name: "Chara", is_farm_cost: true, is_salary: false, active: true, sort_order: 0 }],
    expenses: [{ id: "expense-1", expense_date: fixtures.today, category_id: "farm", amount: 1250, account_id: fixtures.account.id, note: "Chara laya", salary_period_id: null, revision: 1 }],
    monthlyPnl: [], health: [],
  }), error: null });
});

it("downloads today's expense PDF with the saved expense rows", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmExpenses />);
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(documentMocks.buildPdf).toHaveBeenCalledWith(
    `Ajj ka kharcha — ${fixtures.today}`,
    ["expense_date", "category", "kind", "account", "amount", "note"],
    [expect.objectContaining({ category: "Chara", amount: "Rs 1,250", note: "Chara laya" })],
    "Saim Dairy Farm",
  ));
  expect(documentMocks.downloadBlob).toHaveBeenCalledOnce();
});
