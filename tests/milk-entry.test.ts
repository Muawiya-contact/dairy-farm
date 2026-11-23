import { describe, expect, it } from "vitest";
import { animalMilkRows, fillCompanyMilk, milkLitres, milkShiftOpeningStock, parseMilkDispositions, remainingMilk, sumDispositionLitres, sumMilkLitres, type MilkDispositionDraft } from "../src/lib/milk-entry";
import { litres } from "../src/lib/format";
import { localMilkShiftCustomers, milkShiftCustomers, milkShiftLegacyFreeCustomers } from "../src/lib/farm-data";

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
  it("uses the chiller carry-forward when the next shift has little or no new milk", () => {
    const shifts = [
      { milk_shift: "morning", opening_litres: 4219, remaining_litres: 4214 },
    ];
    expect(milkShiftOpeningStock(4219, shifts, "morning")).toBe(4219);
    expect(milkShiftOpeningStock(4219, shifts, "noon")).toBe(4214);
    expect(remainingMilk(milkShiftOpeningStock(4219, shifts, "noon"), 4214)).toBe(0);
    expect(milkShiftOpeningStock(4219, [], "morning")).toBe(4219);
  });
  it("fills the company only once even when tapped twice before a render", () => {
    const first = fillCompanyMilk(12.3, { customer: "5.1", company: "4.1" }, "company");
    expect(first.company).toBe("7.2");
    expect(fillCompanyMilk(12.3, first, "company")).toEqual(first);
  });
  it("parses non-sale destinations separately and reconciles their exact litres", () => {
    const rows: MilkDispositionDraft[] = [
      { key: "free", disposition_type: "free", category: "employee", litres: "10.25", recipient: "Ismail", note: "" },
      { key: "home", disposition_type: "internal", category: "owner_home", litres: "5", recipient: "", note: "" },
      { key: "waste", disposition_type: "wastage", category: "spillage", litres: "5.5", recipient: "", note: "Balti gir gayi" },
      { key: "empty", disposition_type: "free", category: "guest", litres: "", recipient: "", note: "" },
    ];
    const parsed = parseMilkDispositions(rows);
    expect(parsed).toHaveLength(3);
    expect(sumDispositionLitres(parsed)).toBe(20.75);
    expect(remainingMilk(500, sumMilkLitres([65, 75, sumDispositionLitres(parsed)]))).toBe(339.25);
  });
  it("requires a reason for wastage and a useful description for other free milk", () => {
    const row = (overrides: Partial<MilkDispositionDraft>): MilkDispositionDraft => ({
      key: "row", disposition_type: "wastage", category: "spillage", litres: "1", recipient: "", note: "", ...overrides,
    });
    expect(() => parseMilkDispositions([row({})])).toThrow(/wajah/);
    expect(() => parseMilkDispositions([row({ disposition_type: "free", category: "employee" })])).toThrow(/recipient ka naam ya note/);
    expect(parseMilkDispositions([row({ disposition_type: "free", category: "employee", recipient: "Sajid" })])).toHaveLength(1);
    expect(() => parseMilkDispositions([row({ note: "Spill", litres: "1.001" })])).toThrow(RangeError);
  });
  it("does not let company-fill allocate milk already recorded for internal use", () => {
    const filled = fillCompanyMilk(12, { buyer: "4", company: "1" }, "company", 5);
    expect(filled.company).toBe("3");
  });
  it.each(["-1", "1.001", "1e2", "61", "", "not milk"])("rejects invalid animal quantity %s", (raw) => {
    expect(() => milkLitres(raw, 60)).toThrow(RangeError);
  });
  it("rejects a customer quantity above its database limit", () => {
    expect(() => milkLitres("3000.01", 3000)).toThrow(RangeError);
  });
  it("omits blank animal entries but records an explicit zero on a backdated shift", () => {
    expect(animalMilkRows([{ id: "old" }, { id: "new" }, { id: "dry" }],
      { old: "0.25", new: "", dry: "0" })).toEqual([
        { animal_id: "old", litres: 0.25 },
        { animal_id: "dry", litres: 0 },
      ]);
  });
  it("keeps infrequent local customers out of standing defaults while retaining saved history", () => {
    const customers = [
      { id: "standing", name: "Standing", active: true, opening_date: "2026-01-01", sort_order: 0, is_local: false },
      { id: "walk-in", name: "Walk in", active: true, opening_date: "2026-01-01", sort_order: 0, is_local: true },
    ];
    expect(milkShiftCustomers({ customers, deliveries: [] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["standing"]);
    expect(localMilkShiftCustomers({ customers, deliveries: [] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["walk-in"]);
    expect(localMilkShiftCustomers({ customers: customers.map((row) => ({ ...row, active: false })), deliveries: [{ customer_id: "walk-in", delivery_date: "2026-10-10", shift: "morning" }] } as never, "2026-10-10", "morning").map((row) => row.id)).toEqual(["walk-in"]);
  });
  it("keeps legacy free customers only on shifts with saved deliveries", () => {
    const customer = { id: "old-free", name: "Khairat", kind: "free", is_local: false, active: true, opening_date: "2026-01-01", sort_order: 0 };
    expect(milkShiftLegacyFreeCustomers({ customers: [customer], deliveries: [] } as never, "2026-10-10", "morning")).toEqual([]);
    expect(milkShiftLegacyFreeCustomers({ customers: [customer], deliveries: [{ customer_id: customer.id, delivery_date: "2026-10-10", shift: "morning" }] } as never, "2026-10-10", "morning")).toEqual([customer]);
    expect(milkShiftCustomers({ customers: [customer], deliveries: [] } as never, "2026-10-10", "morning")).toEqual([]);
  });
});
