import { screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";

const mocks = vi.hoisted(() => ({ getInventoryStock: vi.fn(), getInventoryItems: vi.fn(), loadInventorySetup: vi.fn() }));
vi.mock("@/lib/farm-inventory", async (original) => ({
  ...(await original<typeof import("@/lib/farm-inventory")>()),
  getInventoryStock: mocks.getInventoryStock,
  getInventoryItems: mocks.getInventoryItems,
  loadInventorySetup: mocks.loadInventorySetup,
}));
vi.mock("@/lib/farm-data", async (original) => ({
  ...(await original<typeof import("@/lib/farm-data")>()), farmToday: () => "2026-11-20",
}));

import FarmInventory from "@/components/FarmInventory";

beforeEach(() => {
  mocks.getInventoryStock.mockResolvedValue([{
    item_id: "small-amount", item_name: "Small amount", category_id: "feed", category_name: "Feed",
    base_unit: "kg", item_type: "consumable", current_stock: 0.0004, minimum_stock: 1,
    low_stock: true, out_of_stock: false,
  }]);
  mocks.getInventoryItems.mockResolvedValue([]);
  mocks.loadInventorySetup.mockResolvedValue({ categories: [], accounts: [], expenseCategories: [], staff: [] });
});

it("shows stock using all six supported decimal places", async () => {
  renderWithQuery(<FarmInventory />);
  expect(await screen.findByText("0.0004 kg")).toBeInTheDocument();
});
