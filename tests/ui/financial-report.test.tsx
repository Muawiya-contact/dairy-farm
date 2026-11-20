import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import FinancialReport from "@/components/FinancialReport";
import { addDays, todayPK } from "@/lib/dates";

const mocks = vi.hoisted(() => ({
  loadFinancialReport: vi.fn(),
  loadFinancialAccountLedger: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock("@/lib/financial-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/financial-report")>();
  return {
    ...actual,
    loadFinancialReport: mocks.loadFinancialReport,
    loadFinancialAccountLedger: mocks.loadFinancialAccountLedger,
  };
});
vi.mock("@/lib/export-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export-data")>();
  return { ...actual, downloadFile: mocks.downloadFile };
});

beforeEach(() => {
  mocks.loadFinancialReport.mockResolvedValue({
    period: {
      farmName: "Test Farm",
      summary: { produced: 20, delivered: 18, sold_litres: 18, free_litres: 0,
        milk_income: 1000, cash_collected: 400, other_income: 200,
        farm_expenses: 300, home_expenses: 75, profit: 900 },
      customers: [{ customer_id: "customer-1", name: "Ali", kind: "regular", sort_order: 1,
        litres: 18, charged: 1000, paid: 400, discount: 0, refund: 0, period_balance_change: 600 }],
      expenses: [{ expense_date: "2026-11-20", category: "Feed", is_farm_cost: true,
        account: "Farm galla", amount: 300, note: "Wanda" }],
    },
    customers: [{ customer_id: "customer-1", name: "Ali", kind: "regular", active: true, sort_order: 1,
      litres: 18, charges: 1000, payments: 400, discounts: 0, refunds: 0,
      opening_balance: 0, opening_added: 0, closing_balance: 600 }],
    accounts: [{ account_id: "cash-1", account_name: "Farm galla", account_kind: "cash",
      opening_balance: 500, money_received: 600, money_paid: 100, transfers_in: 50,
      transfers_out: 50, closing_balance: 1000, opening_date: "2026-11-01", opening_amount: 0 }],
    salaryPayables: [{ staff_id: "staff-1", staff_name: "Ismail", salary_month: "2026-11-01",
      agreed_amount: 1000, paid_amount: 250, outstanding_amount: 750 }],
    otherIncome: [{ income_id: "income-1", income_date: "2026-11-20", kind: "animal_sale",
      amount: 200, note: "Sold cow", animal_tag: "101" }],
    trends: [{ bucket_start: "2026-11-20", milk_income: 1000, other_income: 200,
      customer_collections: 400, farm_expenses: 300, home_expenses: 75,
      total_income: 1200, net_profit: 900, cash_received: 600, cash_paid: 375 }],
  });
  mocks.loadFinancialAccountLedger.mockResolvedValue([]);
  mocks.downloadFile.mockClear();
});

it("shows the selected financial period and separate supported totals", async () => {
  renderWithQuery(<FinancialReport />);
  expect(await screen.findByRole("heading", { name: "Financial Report" })).toBeInTheDocument();
  await screen.findByRole("heading", { name: "Overview" });
  expect(document.querySelector(".print-report")).toBeInTheDocument();
  expect(screen.getAllByText("Rs 1,200").length).toBeGreaterThan(0);
  expect(screen.getByText("Cash received")).toBeInTheDocument();
  expect(screen.getAllByText("Rs 600").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Customer receivables").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Rs 750").length).toBeGreaterThan(0);
  expect(screen.getByText(/Supplier payables are unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/Cost per litre is omitted/)).toBeInTheDocument();
});

it("loads the inclusive Yesterday period and exports the same filtered report", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FinancialReport />);
  await screen.findByRole("heading", { name: "Overview" });
  const yesterday = addDays(todayPK(), -1);
  await user.click(screen.getByRole("button", { name: "Yesterday" }));
  await waitFor(() => expect(mocks.loadFinancialReport).toHaveBeenLastCalledWith(yesterday, yesterday));
  await user.click(screen.getByRole("button", { name: "CSV export" }));
  await waitFor(() => expect(mocks.downloadFile).toHaveBeenCalledTimes(1));
  const [filename, csv] = mocks.downloadFile.mock.calls[0] as [string, string, string];
  expect(filename).toContain(`${yesterday}-to-${yesterday}`);
  expect(csv).toContain("Test Farm");
  expect(csv).toContain("Customer receivables");
  expect(csv).toContain("Financial overview");
});
