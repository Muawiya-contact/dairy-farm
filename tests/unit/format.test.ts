import { describe, expect, it } from "vitest";
import { litres, parseAmount, parseLitres, parsePositiveAmount, parseSignedAmount, rs } from "../../src/lib/format";

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

  it("allows a signed opening balance but rejects malformed values", () => {
    expect(parseSignedAmount("-1,250.50")).toBe(-1250.5);
    expect(parseSignedAmount("0")).toBe(0);
    expect(() => parseSignedAmount("-12.345")).toThrow(RangeError);
    expect(() => parseSignedAmount("--5")).toThrow(RangeError);
  });

  it("requires a positive expense, payment, or sale amount", () => {
    expect(parsePositiveAmount("0.01")).toBe(0.01);
    expect(() => parsePositiveAmount("0")).toThrow(RangeError);
    expect(() => parsePositiveAmount("-10")).toThrow(RangeError);
  });
});
