import { describe, expect, it } from "vitest";
import { parseCashCount, parseDiscount, parsePaymentCorrection, parseTransfer, parseVoidReason } from "../../src/lib/galla-forms";

const today = "2026-10-14";
const accounts = [
  { id: "cash", kind: "cash", active: true },
  { id: "bank", kind: "bank", active: true },
  { id: "closed", kind: "cash", active: false },
];
const form = (items: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(items)) result.set(key, value);
  return result;
};

describe("galla form validation", () => {
  it("accepts a dated transfer and rejects invalid money and accounts", () => {
    const base = { date: today, from: "cash", to: "bank", amount: "125.50", note: "  Milk cash  " };
    expect(parseTransfer(form(base), today, accounts)).toEqual({ date: today, from: "cash", to: "bank", amount: 125.5, note: "Milk cash" });
    for (const patch of [{ to: "cash" }, { to: "closed" }, { amount: "-1" }, { amount: "0" }, { amount: "1.001" }, { date: "2026-10-15" }, { date: "2026-02-30" }]) {
      expect(() => parseTransfer(form({ ...base, ...patch }), today, accounts)).toThrow();
    }
  });

  it("allows zero counted cash, rejects negative and non-cash counts", () => {
    const base = { date: today, account: "cash", amount: "0", reason: "" };
    expect(parseCashCount(form(base), today, accounts)).toMatchObject({ counted: 0, accountId: "cash", reason: null });
    expect(() => parseCashCount(form({ ...base, amount: "-1" }), today, accounts)).toThrow();
    expect(() => parseCashCount(form({ ...base, account: "bank" }), today, accounts)).toThrow();
  });

  it("requires a discount reason and validates corrections", () => {
    expect(parseDiscount(form({ date: today, amount: "10.25", reason: "  Riayat  " }), today)).toEqual({ date: today, amount: 10.25, reason: "Riayat" });
    expect(() => parseDiscount(form({ date: today, amount: "10", reason: "" }), today)).toThrow();
    expect(parsePaymentCorrection(form({ date: today, amount: "20", method: "cash", account: "cash", reason: "  Typo  " }), today, "payment", accounts)).toMatchObject({ amount: 20, accountId: "cash", reason: "Typo" });
    expect(() => parsePaymentCorrection(form({ date: today, amount: "20", method: "cash", account: "closed", reason: "Typo" }), today, "payment", accounts)).toThrow();
    expect(parsePaymentCorrection(form({ date: today, amount: "20", reason: "Typo" }), today, "discount", accounts)).toMatchObject({ method: null, accountId: null });
    expect(() => parseVoidReason(form({ reason: " " }))).toThrow();
  });
});
