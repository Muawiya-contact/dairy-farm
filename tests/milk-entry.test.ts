import { describe, expect, it } from "vitest";
import { milkLitres, remainingMilk, sumMilkLitres } from "../src/lib/milk-entry";

describe("daily milk entry quantities", () => {
  it("accepts exact hundredths for animals and customers", () => {
    expect(milkLitres("0.25", 60)).toBe(0.25);
    expect(milkLitres("60", 60)).toBe(60);
    expect(sumMilkLitres([0.1, 0.2, 10.25])).toBe(10.55);
    expect(remainingMilk(0.3, sumMilkLitres([0.1, 0.2]))).toBe(0);
  });
  it.each(["-1", "1.001", "1e2", "61", "", "not milk"])("rejects invalid animal quantity %s", (raw) => {
    expect(() => milkLitres(raw, 60)).toThrow(RangeError);
  });
  it("rejects a customer quantity above its database limit", () => {
    expect(() => milkLitres("3000.01", 3000)).toThrow(RangeError);
  });
});
