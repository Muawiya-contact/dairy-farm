import { describe, expect, it } from "vitest";
import { animalMilkRows, fillCompanyMilk, milkLitres, remainingMilk, sumMilkLitres } from "../src/lib/milk-entry";
import { litres } from "../src/lib/format";
import { localMilkShiftCustomers, milkShiftCustomers } from "../src/lib/farm-data";

describe("daily milk entry quantities", () => {
  it("accepts exact hundredths for animals and customers", () => {
    expect(milkLitres("0.25", 60)).toBe(0.25);
    expect(milkLitres("60", 60)).toBe(60);
    expect(sumMilkLitres([0.1, 0.2, 10.25])).toBe(10.55);
    expect(remainingMilk(0.3, sumMilkLitres([0.1, 0.2]))).toBe(0);
  });
  it("keeps the save balance and collection-center fill exact for fractional litres", () => {
    const delivered = sumMilkLitres([1.1, 2.2]);
    expect(remainingMilk(3.3, delivered)).toBe(0);
    expect(remainingMilk(12.3, sumMilkLitres([5.1, 4.1]))).toBe(3.1);
    expect(String(sumMilkLitres([0, 3.1]))).toBe("3.1");
    expect(litres(sumMilkLitres([1.1, 2.2]))).toBe("3.3 L");
  });
  it("fills the company only once even when tapped twice before a render", () => {
    const first = fillCompanyMilk(12.3, { customer: "5.1", company: "4.1" }, "company");
    expect(first.company).toBe("7.2");
    expect(fillCompanyMilk(12.3, first, "company")).toEqual(first);
  });
  it.each(["-1", "1.001", "1e2", "61", "", "not milk"])("rejects invalid animal quantity %s", (raw) => {
    expect(() => milkLitres(raw, 60)).toThrow(RangeError);
  });
  it("rejects a customer quantity above its database limit", () => {
    expect(() => milkLitres("3000.01", 3000)).toThrow(RangeError);
  });
  it("does not create animal rows for blank or zero values on a backdated shift", () => {
    expect(animalMilkRows([{ id: "old" }, { id: "new" }, { id: "dry" }],
      { old: "0.25", new: "", dry: "0" })).toEqual([{ animal_id: "old", litres: 0.25 }]);
  });
  it("keeps infrequent local customers out of standing defaults while retaining saved history", () => {
    const customers = [
      { id: "standing", name: "Standing", active: true, opening_date: "2026-01-01", sort_order: 0, is_local: false },
      { id: "walk-in", name: "Walk in", active: true, opening_date: "2026-01-01", sort_order: 0, is_local: true },
    ];
    expect(milkShiftCustomers({ customers, deliveries: [] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["standing"]);
    expect(localMilkShiftCustomers({ customers, deliveries: [] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["walk-in"]);
    expect(milkShiftCustomers({ customers: customers.map((row) => ({ ...row, active: false })), deliveries: [{ customer_id: "walk-in", delivery_date: "2026-10-10", shift: "morning" }] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["walk-in"]);
  });
});
