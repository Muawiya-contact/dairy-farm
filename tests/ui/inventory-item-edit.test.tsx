import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";

const mocks = vi.hoisted(() => ({
  getInventoryStock: vi.fn(), getInventoryItems: vi.fn(), loadInventorySetup: vi.fn(),
  getInventoryHistory: vi.fn(), updateInventoryItem: vi.fn(),
}));

vi.mock("@/lib/farm-inventory", async (original) => ({
  ...(await original<typeof import("@/lib/farm-inventory")>()),
  getInventoryStock: mocks.getInventoryStock,
  getInventoryItems: mocks.getInventoryItems,
  loadInventorySetup: mocks.loadInventorySetup,
  getInventoryHistory: mocks.getInventoryHistory,
  updateInventoryItem: mocks.updateInventoryItem,
}));
vi.mock("@/lib/farm-data", async (original) => ({
  ...(await original<typeof import("@/lib/farm-data")>()), farmToday: () => "2026-11-20",
}));

import FarmInventory from "@/components/FarmInventory";

const item = {
  id: "item-old-feed", name: "Old feed", category_id: "category-archived", base_unit: "kg",
  item_type: "consumable", minimum_stock: 1, active: true, revision: 1,
};
const category = (id: string, name: string, active: boolean) => ({
  id, name, active, sort_order: 1, revision: 1, description: null,
  create_request_id: null, create_request_payload: null, created_by: null, updated_by: null,
  created_at: "", updated_at: "",
});

beforeEach(() => {
  mocks.getInventoryStock.mockResolvedValue([{
    item_id: item.id, item_name: item.name, category_id: item.category_id, category_name: "Archived feed",
    base_unit: "kg", item_type: "consumable", current_stock: 4, minimum_stock: 1, low_stock: false, out_of_stock: false,
  }]);
  mocks.getInventoryItems.mockResolvedValue([item]);
  mocks.loadInventorySetup.mockResolvedValue({
    categories: [category("category-archived", "Archived feed", false), category("category-active", "Current feed", true)],
    accounts: [], expenseCategories: [], staff: [],
  });
  mocks.getInventoryHistory.mockResolvedValue([]);
  mocks.updateInventoryItem.mockResolvedValue(undefined);
});

it("preserves an item's inactive category while editing another field", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmInventory />);

  await user.click(await screen.findByRole("button", { name: "Old feed badlein" }));
  const editForm = screen.getByRole("button", { name: "Samaan mehfooz karein" }).closest("form")!;
  const categorySelect = within(editForm).getByRole("combobox", { name: "Qism" });
  expect(categorySelect).toHaveValue("category-archived");
  expect(within(categorySelect).getByRole("option", { name: "Archived feed (band hai)" })).toBeInTheDocument();

  editForm.noValidate = true;
  await user.click(screen.getByRole("button", { name: "Samaan mehfooz karein" }));
  await waitFor(() => expect(mocks.updateInventoryItem).toHaveBeenCalledWith(expect.objectContaining({
    id: item.id, category_id: "category-archived", name: item.name,
  })));
});
