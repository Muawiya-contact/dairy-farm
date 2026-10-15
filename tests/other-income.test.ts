import { expect, it } from "vitest";
import { parseOtherIncome } from "../src/lib/other-income";

const accounts = [{ id: "cash", active: true, opening_date: "2026-10-01" }] as Parameters<typeof parseOtherIncome>[2];
const entry = (amount: string, date = "2026-10-16") => {
  const form = new FormData();
  form.set("date", date); form.set("kind", "manure"); form.set("account", "cash"); form.set("amount", amount);
  return parseOtherIncome(form, "2026-10-16", accounts);
};

it("accepts an explicit positive manure receipt", () => {
  expect(entry("125.50")).toEqual({ date: "2026-10-16", kind: "manure", amount: 125.5, accountId: "cash", note: null });
});
it("rejects negative, zero, overprecise, future and pre-opening receipts", () => {
  for (const value of ["-1", "0", "1.001"]) expect(() => entry(value)).toThrow();
  expect(() => entry("1", "2026-10-17")).toThrow();
  expect(() => entry("1", "2026-09-30")).toThrow();
});
