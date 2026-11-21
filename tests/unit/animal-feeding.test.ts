import { describe, expect, it } from "vitest";
import { activeAnimalFeedRecords, animalFeedPeriodTotals, compatibleFeedUnits } from "@/lib/animal-feeding";
import type { AnimalFeedRecord } from "@/lib/farm-data";

const record = (overrides: Partial<AnimalFeedRecord> = {}): AnimalFeedRecord => ({
  id: "feed-1", animal_id: "animal-1", inventory_item_id: "item-1", feed_date: "2026-11-20", quantity: 500,
  unit: "g", stock_quantity: 0.5, stock_unit: "kg", note: null, stock_movement_id: "movement-1",
  request_id: "request-1", request_payload: {}, supersedes_id: null, created_at: "2026-11-20T10:00:00Z",
  item_name: "Wanda", category_name: "Animal feed & fodder", item_base_unit: "kg", superseded_by: null, ...overrides,
});

describe("animal feed history and summaries", () => {
  it("converts only compatible feed units", () => {
    expect(compatibleFeedUnits("kg")).toEqual(["kg", "g", "ton"]);
    expect(compatibleFeedUnits("litre")).toEqual(["litre", "ml"]);
    expect(compatibleFeedUnits("bag")).toEqual(["bag"]);
  });

  it("uses only the latest corrected entry and sums normalized quantity for the chosen period", () => {
    const original = record({ id: "old", stock_quantity: 2, quantity: 2, unit: "kg", superseded_by: "replacement" });
    const replacement = record({ id: "replacement", stock_quantity: 1, quantity: 1, unit: "kg", supersedes_id: "old", feed_date: "2026-11-20" });
    const secondItem = record({ id: "other-item", inventory_item_id: "item-2", item_name: "Dry fodder", stock_quantity: 3, stock_unit: "kg", feed_date: "2026-11-19" });
    const outside = record({ id: "outside", feed_date: "2026-10-31", stock_quantity: 100 });
    expect(activeAnimalFeedRecords([original, replacement, secondItem, outside]).map((entry) => entry.id)).toEqual(["replacement", "other-item", "outside"]);
    expect(animalFeedPeriodTotals([original, replacement, secondItem, outside], "2026-11-01", "2026-11-30")).toEqual([
      { item_id: "item-2", item_name: "Dry fodder", category_name: "Animal feed & fodder", quantity: 3, unit: "kg", entries: 1 },
      { item_id: "item-1", item_name: "Wanda", category_name: "Animal feed & fodder", quantity: 1, unit: "kg", entries: 1 },
    ]);
  });
});
