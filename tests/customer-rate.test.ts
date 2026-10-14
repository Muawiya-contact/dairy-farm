import { expect, test } from "vitest";
import { customerRate, milkShiftAnimals, milkShiftCustomers } from "../src/lib/farm-data";

test("milk entry uses the rate effective on its selected date", () => {
  const data = {
    today: "2026-10-12",
    rates: [
      { id: "r1", customer_id: "a", rate: 150, effective_from: "2026-09-01" },
      { id: "r2", customer_id: "a", rate: 180, effective_from: "2026-10-01" },
      { id: "r3", customer_id: "b", rate: 400, effective_from: "2026-09-01" },
    ],
  };
  expect(customerRate(data, "a", "2026-09-30")).toBe(150);
  expect(customerRate(data, "a")).toBe(180);
  expect(customerRate(data, "a", "2026-08-31")).toBe(0);
});

test("editing an old milk shift keeps a later-deactivated customer's delivery", () => {
  const data = {
    customers: [
      { id: "active", active: true }, { id: "old", active: false }, { id: "unused", active: false },
    ],
    deliveries: [{ customer_id: "old", delivery_date: "2026-10-01", shift: "morning" }],
  } as unknown as Parameters<typeof milkShiftCustomers>[0];
  expect(milkShiftCustomers(data, "2026-10-01", "morning").map((customer) => customer.id)).toEqual(["active", "old"]);
  expect(milkShiftCustomers(data, "2026-10-02", "morning").map((customer) => customer.id)).toEqual(["active"]);
});

test("editing an old per-animal shift keeps a cow that is now dry or sold", () => {
  const data = {
    animals: [
      { id: "current", life_status: "active", sex: "female", milking_status: "milking" },
      { id: "dry", life_status: "active", sex: "female", milking_status: "dry" },
      { id: "sold", life_status: "sold", sex: "female", milking_status: "none" },
    ],
    animalMilk: [
      { animal_id: "dry", shift_id: "old" },
      { animal_id: "sold", shift_id: "old" },
    ],
  } as unknown as Parameters<typeof milkShiftAnimals>[0];
  expect(milkShiftAnimals(data, "old").map((animal) => animal.id)).toEqual(["current", "dry", "sold"]);
  expect(milkShiftAnimals(data, "new").map((animal) => animal.id)).toEqual(["current"]);
});
