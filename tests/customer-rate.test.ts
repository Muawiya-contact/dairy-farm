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
      { id: "active", name: "Active customer", sort_order: 1, active: true, opening_date: "2026-09-01" },
      { id: "old", name: "Old customer", sort_order: 2, active: false, opening_date: "2026-09-01" },
      { id: "unused", name: "Unused customer", sort_order: 3, active: false, opening_date: "2026-09-01" },
    ],
    deliveries: [{ customer_id: "old", delivery_date: "2026-10-01", shift: "morning" }],
  } as unknown as Parameters<typeof milkShiftCustomers>[0];
  expect(milkShiftCustomers(data, "2026-10-01", "morning").map((customer) => customer.id)).toEqual(["active", "old"]);
  expect(milkShiftCustomers(data, "2026-10-02", "morning").map((customer) => customer.id)).toEqual(["active"]);
});

test("backdated milk entry excludes customers who opened later", () => {
  const data = {
    customers: [
      { id: "existing", name: "Existing customer", sort_order: 1, active: true, opening_date: "2026-10-01" },
      { id: "new", name: "New customer", sort_order: 2, active: true, opening_date: "2026-10-10" },
    ],
    deliveries: [],
  } as unknown as Parameters<typeof milkShiftCustomers>[0];
  expect(milkShiftCustomers(data, "2026-10-05", "morning").map((customer) => customer.id)).toEqual(["existing"]);
  expect(milkShiftCustomers(data, "2026-10-10", "morning").map((customer) => customer.id)).toEqual(["existing", "new"]);
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

test("backdated milk entry hides cows that had not arrived yet", () => {
  const data = {
    animals: [
      { id: "there", life_status: "active", sex: "female", milking_status: "milking", arrival_date: "2026-09-01" },
      { id: "new", life_status: "active", sex: "female", milking_status: "milking", arrival_date: "2026-10-10" },
    ],
    animalMilk: [],
  } as unknown as Parameters<typeof milkShiftAnimals>[0];
  expect(milkShiftAnimals(data, undefined, "2026-10-01").map((animal) => animal.id)).toEqual(["there"]);
});

test("backdated milk entry offers cows present then, even if now dry or sold", () => {
  const data = {
    animals: [
      { id: "current", life_status: "active", sex: "female", milking_status: "milking", arrival_date: "2026-09-01" },
      { id: "dry", life_status: "active", sex: "female", milking_status: "dry", arrival_date: "2026-09-01" },
      { id: "sold", life_status: "sold", sex: "female", milking_status: "none", arrival_date: "2026-09-01", exit_date: "2026-10-10" },
      { id: "gone", life_status: "sold", sex: "female", milking_status: "none", arrival_date: "2026-09-01", exit_date: "2026-10-01" },
      { id: "later", life_status: "active", sex: "female", milking_status: "milking", arrival_date: "2026-10-10" },
    ],
    animalMilk: [],
  } as unknown as Parameters<typeof milkShiftAnimals>[0];
  expect(milkShiftAnimals(data, undefined, "2026-10-05", "2026-10-15").map((animal) => animal.id)).toEqual(["current", "dry", "sold"]);
  expect(milkShiftAnimals(data, undefined, "2026-10-15", "2026-10-15").map((animal) => animal.id)).toEqual(["current", "later"]);
});
