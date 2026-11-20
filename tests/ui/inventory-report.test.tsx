import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import InventoryReport from "@/components/InventoryReport";
import { inventoryReportRange, isInventoryReportDateRange } from "@/lib/inventory-report";

const mocks = vi.hoisted(() => ({
  getInventoryItems: vi.fn(), loadInventorySetup: vi.fn(), loadInventoryReportStaff: vi.fn(), getSettings: vi.fn(),
  getInventoryReportSummary: vi.fn(), getInventoryReportUsage: vi.fn(), getInventoryReportTransactions: vi.fn(),
  buildPdfReport: vi.fn(), downloadBlob: vi.fn(), buildInventoryReportWorkbook: vi.fn(),
}));

vi.mock("@/lib/farm-inventory", async (original) => ({
  ...(await original<typeof import("@/lib/farm-inventory")>()),
  getInventoryItems: mocks.getInventoryItems,
  loadInventorySetup: mocks.loadInventorySetup,
  loadInventoryReportStaff: mocks.loadInventoryReportStaff,
  getInventoryReportSummary: mocks.getInventoryReportSummary,
  getInventoryReportUsage: mocks.getInventoryReportUsage,
  getInventoryReportTransactions: mocks.getInventoryReportTransactions,
}));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: mocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: mocks.buildPdfReport, downloadBlob: mocks.downloadBlob }));
vi.mock("@/lib/inventory-report", async (original) => ({ ...(await original<typeof import("@/lib/inventory-report")>()), buildInventoryReportWorkbook: mocks.buildInventoryReportWorkbook }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-11-20" }));

const summaryRows = [
  { item_id: "kg-item", item_name: "Feed", category_id: "feed", category_name: "Animal feed", stock_unit: "kg", active: true,
    minimum_stock: 3, opening_stock: 10, opening_entries_in: 0, purchases_in: 5, usage_out: 2, adjustment_in: 1,
    adjustment_out: 0, wastage_out: 1, closing_stock: 13, purchase_amount: 500, current_stock: 13,
    current_low_stock: false, current_out_of_stock: false },
  { item_id: "litre-item", item_name: "Medicine", category_id: "medicine", category_name: "Medicines", stock_unit: "litre", active: true,
    minimum_stock: 1, opening_stock: 2, opening_entries_in: 0, purchases_in: 0, usage_out: 0, adjustment_in: 0,
    adjustment_out: 0, wastage_out: 0, closing_stock: 2, purchase_amount: 0, current_stock: 0,
    current_low_stock: false, current_out_of_stock: true },
];
const movement = {
  movement_id: "movement-1", movement_seq: 1, item_id: "kg-item", item_name: "Feed", category_id: "feed",
  category_name: "Animal feed", movement_date: "2026-11-18", movement_type: "purchase", quantity_delta: 5,
  entered_quantity: 5, entered_unit: "kg", stock_unit: "kg", running_balance_after: 15, unit_rate: 100,
  total_amount: 500, account_name: "Farm Galla", expense_id: "expense-1", staff_id: null, staff_name: null,
  supplier: "Feed supplier", reference: "INV-1", batch_code: "B-1", expiry_date: null, purpose: null,
  reason: null, note: null, actor_id: "user-12345678", matched_count: 1,
};
const unassignedUsage = {
  ...movement, movement_id: "movement-usage", movement_seq: 2, movement_type: "usage", quantity_delta: -1,
  entered_quantity: 1, unit_rate: null, total_amount: null, account_name: null, expense_id: null,
  purpose: "General farm use", supplier: null, reference: null, batch_code: null, expiry_date: null,
  running_balance_after: 13,
};

beforeEach(() => {
  mocks.getInventoryItems.mockResolvedValue([
    { id: "kg-item", name: "Feed", category_id: "feed", base_unit: "kg", item_type: "consumable", minimum_stock: 3, active: true, revision: 1 },
    { id: "litre-item", name: "Medicine", category_id: "medicine", base_unit: "litre", item_type: "consumable", minimum_stock: 1, active: true, revision: 1 },
  ]);
  mocks.loadInventorySetup.mockResolvedValue({ categories: [
    { id: "feed", name: "Animal feed", active: true, sort_order: 1, revision: 1, description: null, create_request_id: null, create_request_payload: null, created_by: null, updated_by: null, created_at: "", updated_at: "" },
    { id: "medicine", name: "Medicines", active: true, sort_order: 2, revision: 1, description: null, create_request_id: null, create_request_payload: null, created_by: null, updated_by: null, created_at: "", updated_at: "" },
  ], accounts: [], expenseCategories: [], staff: [] });
  mocks.loadInventoryReportStaff.mockResolvedValue([{ id: "staff-1", name: "Ali", active: true }]);
  mocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
  mocks.getInventoryReportSummary.mockResolvedValue(summaryRows);
  const assignedUsage = { item_id: "kg-item", item_name: "Feed", category_id: "feed", category_name: "Animal feed", stock_unit: "kg", staff_id: "staff-1", staff_name: "Ali", total_quantity: 2, transaction_count: 1 };
  const generalUsage = { ...assignedUsage, staff_id: null, staff_name: null, total_quantity: 1 };
  mocks.getInventoryReportUsage.mockImplementation(async (_from, _to, _item, _category, _staff, unassigned) => unassigned ? [generalUsage] : [assignedUsage, generalUsage]);
  mocks.getInventoryReportTransactions.mockImplementation(async (input) => [
    { ...(input.unassigned ? unassignedUsage : movement), matched_count: 1 },
  ]);
  mocks.buildPdfReport.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.buildInventoryReportWorkbook.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.downloadBlob.mockReset();
});

it("uses Pakistan date periods and rejects invalid ranges", () => {
  expect(inventoryReportRange("week", "2026-11-20")).toEqual({ from: "2026-11-14", to: "2026-11-20" });
  expect(inventoryReportRange("yesterday", "2026-11-20")).toEqual({ from: "2026-11-19", to: "2026-11-19" });
  expect(inventoryReportRange("month", "2026-11-20")).toEqual({ from: "2026-11-01", to: "2026-11-20" });
  expect(inventoryReportRange("year", "2026-11-20")).toEqual({ from: "2026-01-01", to: "2026-11-20" });
  expect(isInventoryReportDateRange("2026-11-20", "2026-11-20", "2026-11-20")).toBe(true);
  expect(isInventoryReportDateRange("2026-11-21", "2026-11-20", "2026-11-20")).toBe(false);
  expect(isInventoryReportDateRange("2026-11-01", "2026-11-21", "2026-11-20")).toBe(false);
  expect(isInventoryReportDateRange("2016-01-01", "2026-11-20", "2026-11-20")).toBe(false);
});

it("keeps each item unit separate, labels unassigned usage, and exports filtered movements", async () => {
  const user = userEvent.setup();
  renderWithQuery(<InventoryReport />);
  await screen.findByRole("heading", { name: "Item-wise stock balances" });
  expect(screen.getByText("13 kg")).toBeInTheDocument();
  const medicineRow = screen.getAllByRole("row").find((row) => row.textContent?.includes("Medicine"));
  expect(medicineRow).toBeDefined();
  expect(medicineRow).toHaveTextContent("2");
  expect(medicineRow).toHaveTextContent("litre");
  expect(screen.getByText("Out of stock")).toBeInTheDocument();
  expect(screen.getAllByText("General farm use (unassigned)")).not.toHaveLength(0);
  expect(screen.getByText(/Usage value is unavailable/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "This week" }));
  await waitFor(() => expect(mocks.getInventoryReportSummary).toHaveBeenLastCalledWith("2026-11-14", "2026-11-20", null, null));
  await user.selectOptions(screen.getByRole("combobox", { name: "Issued to" }), "general");
  await waitFor(() => expect(mocks.getInventoryReportUsage).toHaveBeenLastCalledWith("2026-11-14", "2026-11-20", null, null, null, true));

  await user.type(screen.getByRole("textbox", { name: "Search movement details" }), "General farm use");
  await waitFor(() => expect(mocks.getInventoryReportTransactions).toHaveBeenLastCalledWith(expect.objectContaining({
    search: "General farm use", unassigned: true, limit: 50, offset: 0,
  })));
  expect(screen.getAllByRole("row").some((row) => row.textContent?.includes("Medicine"))).toBe(true);
  expect(screen.getAllByText("General farm use (unassigned)").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(mocks.buildPdfReport).toHaveBeenCalledOnce());
  expect(mocks.buildPdfReport).toHaveBeenCalledWith(
    "Inventory Report — 2026-11-14 to 2026-11-20",
    expect.arrayContaining([
      expect.objectContaining({ title: "Report details", rows: expect.arrayContaining([
        expect.objectContaining({ detail: "Period (inclusive)", value: "2026-11-14 through 2026-11-20" }),
        expect.objectContaining({ detail: "Filters", value: "Search: General farm use · Usage: General farm use (unassigned)" }),
        expect.objectContaining({ detail: "Balance scope", value: expect.stringContaining("farm-wide") }),
      ]) }),
      expect.objectContaining({ title: "Item-wise stock balances", rows: expect.arrayContaining([expect.objectContaining({ stock_unit: "kg" }), expect.objectContaining({ stock_unit: "litre" })]) }),
      expect.objectContaining({ title: "Employee-wise usage" }),
      expect.objectContaining({ title: "Inventory movements" }),
    ]),
    "Saim Dairy Farm",
  );
  expect(mocks.downloadBlob).toHaveBeenCalledWith("inventory-report-20261114-20261120.pdf", expect.any(Blob));
});
