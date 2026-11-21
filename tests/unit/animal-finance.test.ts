import { describe, expect, it } from "vitest";
import { animalFinancialSummary } from "@/lib/animal-finance";
import type { Animal, AnimalFeedRecord, AnimalIncomeEntry, HealthEvent } from "@/lib/farm-data";

const animal = {
  id: "animal-1", tag: "C-1", name: "Calf", species: "cow", breed: null, sex: "female", category: "cow",
  birth_date: null, arrival_date: "2025-01-01", estimated_age_months_at_arrival: null, mother_id: null,
  purchase_date: "2025-01-01", purchase_price: 1000, seller_name: null, purchase_location: null, photo_path: null,
  source: "purchased", sire: null, milking_status: "milking", life_status: "sold", exit_date: "2026-11-20",
  exit_reason: null, sale_price: 2000, notes: null, updated_at: "2026-11-20T00:00:00Z",
} as Animal;

const income = (overrides: Partial<AnimalIncomeEntry> = {}): AnimalIncomeEntry => ({
  id: "income-1", animal_id: "animal-1", income_date: "2026-11-20", kind: "animal_sale", amount: 2000,
  account_id: "account-1", note: null, created_at: "2026-11-20T00:00:00Z", ...overrides,
});

const feed = {
  id: "feed-1", animal_id: "animal-1", inventory_item_id: "item-1", feed_date: "2026-11-19", quantity: 2,
  unit: "kg", stock_quantity: 2, stock_unit: "kg", note: null, stock_movement_id: "movement-1", request_id: "request-1",
  request_payload: {}, supersedes_id: null, created_at: "2026-11-19T00:00:00Z", item_name: "Wanda",
  category_name: "Animal feed & fodder", item_base_unit: "kg", superseded_by: null,
} as AnimalFeedRecord;

describe("animal lifetime finance summary", () => {
  it("keeps linked medical costs and sale revenue in recorded totals and milk value as a separate estimate", () => {
    const health = [
      { id: "linked", animal_id: "animal-1", event_date: "2026-11-01", title: "Treatment", cost: 100, expense_id: "expense-1" },
      { id: "linked-duplicate", animal_id: "animal-1", event_date: "2026-11-01", title: "Duplicate link", cost: 100, expense_id: "expense-1" },
      { id: "unlinked", animal_id: "animal-1", event_date: "2026-11-02", title: "Old cost", cost: 50, expense_id: null },
      { id: "unknown", animal_id: "animal-1", event_date: "2026-11-03", title: "Vaccine", cost: 0, expense_id: null },
      { id: "other-animal", animal_id: "other", event_date: "2026-11-04", title: "Other", cost: 999, expense_id: "expense-2" },
    ] as HealthEvent[];
    const result = animalFinancialSummary({
      animal, health, income: [income(), income({ id: "manure", kind: "manure", amount: 150 })],
      milk: [{ id: "milk-1", animal_id: "animal-1", shift_id: "shift-1", litres: 6.5 }], feed: [feed], currentMilkRate: 150,
    });
    expect(result.recorded_cost_rs).toBe(1100);
    expect(result.recorded_revenue_rs).toBe(2150);
    expect(result.net_recorded_rs).toBe(1050);
    expect(result.milk_litres).toBe(6.5);
    expect(result.milk_value_estimate_rs).toBe(975);
    expect(result.feed_entries_without_valuation).toBe(1);
    expect(result.health_costs_without_linked_expense).toBe(1);
    expect(result.health_events_without_cost).toBe(1);
    expect(result.lines.find((line) => line.kind === "Milk production value estimate")?.included_in_recorded_total).toBe(false);
    expect(result.lines.find((line) => line.kind === "Health cost (unlinked)")?.included_in_recorded_total).toBe(false);
  });

  it("does not infer revenue, costs or milk quantities from absent records", () => {
    const sparseAnimal = { ...animal, purchase_price: null, sale_price: null, life_status: "active" } as Animal;
    const result = animalFinancialSummary({ animal: sparseAnimal, health: [], income: [], milk: [], feed: [], currentMilkRate: 150 });
    expect(result.recorded_cost_rs).toBe(0);
    expect(result.recorded_revenue_rs).toBe(0);
    expect(result.milk_litres).toBeNull();
    expect(result.milk_value_estimate_rs).toBeNull();
    expect(result.lines).toEqual([]);
  });
});
