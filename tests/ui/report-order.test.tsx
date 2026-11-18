import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import ReportsWorkspace from "@/components/ReportsWorkspace";

const loadPeriodReport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reporting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reporting")>();
  return { ...actual, loadPeriodReport };
});

it("orders printed customers using the report rows without another customer-table read", async () => {
  loadPeriodReport.mockResolvedValue({
    farmName: "Test Farm",
    summary: { produced: 0, delivered: 0, sold_litres: 0, free_litres: 0, milk_income: 0, cash_collected: 0, other_income: 0, farm_expenses: 0, home_expenses: 0, profit: 0 },
    customers: [
      { customer_id: "c2", name: "Ali", kind: "cash", sort_order: 1, litres: 0, charged: 0, paid: 0, discount: 0, period_balance_change: 0 },
      { customer_id: "c1", name: "Bilal", kind: "cash", sort_order: 1, litres: 0, charged: 0, paid: 0, discount: 0, period_balance_change: 0 },
      { customer_id: "c3", name: "Zara", kind: "cash", sort_order: 2, litres: 0, charged: 0, paid: 0, discount: 0, period_balance_change: 0 },
    ],
    expenses: [],
  });

  renderWithQuery(<ReportsWorkspace />);
  const heading = await screen.findByRole("heading", { name: "Customer ka period hisaab" });
  const rows = within(heading.closest("section")!).getAllByRole("row");
  expect(rows.slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent))
    .toEqual(["Ali", "Bilal", "Zara"]);
});
