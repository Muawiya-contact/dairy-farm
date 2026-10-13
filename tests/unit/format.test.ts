import { describe, expect, it } from "vitest";
import { litres, parseAmount, parseLitres, rs } from "../../src/lib/format";

describe("farm number helpers", () => {
  it("formats Pakistani rupees and litres", () => {
    expect(rs(320000)).toBe("Rs 3,20,000");
    expect(rs(-22833)).toBe("− Rs 22,833");
    expect(litres(12.5)).toBe("12.5 L");
  });

  it("accepts trimmed and grouped amounts", () => {
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount(" 250 ")).toBe(250);
    expect(parseLitres("12.5")).toBe(12.5);
    expect(parseLitres("0")).toBe(0);
  });

  it.each(["-5", "abc", "1.2.3", "12.555", "1,50", "", "Infinity"])("rejects %s", (input) => {
    expect(() => parseAmount(input)).toThrow(RangeError);
    expect(() => parseLitres(input)).toThrow(RangeError);
  });
});
