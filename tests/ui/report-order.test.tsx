import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import ReportsPage from "@/app/reports/page";

const fetchReport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/export-data", () => ({ fetchReport }));
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn().mockResolvedValue({ farm_name: "Test Farm" }) }));

it("orders printed customers using the report rows without another customer-table read", async () => {
  fetchReport.mockImplementation(async (name: string) => name === "customer_month_report" ? [
    { customer_id: "c3", name: "Zara", sort_order: 2 },
    { customer_id: "c1", name: "Bilal", sort_order: 1 },
    { customer_id: "c2", name: "Ali", sort_order: 1 },
  ] : []);

  renderWithQuery(<ReportsPage />);
  const heading = await screen.findByRole("heading", { name: "Customer ka hisaab" });
  const rows = within(heading.closest("section")!).getAllByRole("row");
  expect(rows.slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent))
    .toEqual(["Ali", "Bilal", "Zara"]);
});
