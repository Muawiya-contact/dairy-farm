import { describe, expect, it } from "vitest";
import { expenseMode, parseExpenseCorrection, parseExpenseEntry } from "../src/lib/expense-forms";

const today = "2026-10-14";
const accounts = [
  { id: "cash", active: true, opening_date: "2026-09-01" },
  { id: "new", active: true, opening_date: "2026-10-10" },
  { id: "closed", active: false, opening_date: "2026-09-01" },
];
const categories = [
  { id: "farm", name: "Wanda", is_farm_cost: true, is_salary: false, active: true },
  { id: "home", name: "Ghar ka kharcha", is_farm_cost: false, is_salary: false, active: true },
  { id: "personal", name: "Dukan bill", is_farm_cost: false, is_salary: false, active: true },
  { id: "inactive", name: "Purana", is_farm_cost: true, is_salary: false, active: false },
  { id: "salary", name: "Tankhwah", is_farm_cost: true, is_salary: true, active: true },
];

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ date: today, account: "cash", amount: "125.50", note: "", ...fields })) {
    data.set(key, value);
  }
  return data;
}

describe("expense entry form", () => {
  it("requires a reason and validates every corrected value", () => {
    const corrected = parseExpenseCorrection(form({ category: "farm", amount: "89.25", reason: "Raqam ghalat thi" }), today, accounts, categories);
    expect(corrected).toEqual({ input: { date: today, accountId: "cash", categoryId: "farm", amount: 89.25, note: null }, reason: "Raqam ghalat thi" });
    expect(() => parseExpenseCorrection(form({ category: "farm", reason: "no" }), today, accounts, categories)).toThrow(/5 se 500/);
    expect(() => parseExpenseCorrection(form({ category: "salary", reason: "Raqam ghalat thi" }), today, accounts, categories)).toThrow(/Tankhwah/);
    expect(() => parseExpenseCorrection(form({ category: "farm", amount: "-5", reason: "Raqam ghalat thi" }), today, accounts, categories)).toThrow(/Raqam/);
  });
  it("selects the dedicated home category and keeps other personal costs distinct", () => {
    expect(parseExpenseEntry(form({ note: "  ghar ke liye  " }), "home", today, accounts, categories))
      .toEqual({ date: today, accountId: "cash", categoryId: "home", amount: 125.5, note: "ghar ke liye" });
    expect(expenseMode(categories[1])).toBe("home");
    expect(expenseMode(categories[2])).toBe("personal");
    expect(parseExpenseEntry(form({ category: "personal" }), "personal", today, accounts, categories).categoryId).toBe("personal");
    expect(() => parseExpenseEntry(form({ category: "farm" }), "personal", today, accounts, categories)).toThrow(/category/);
    expect(() => parseExpenseEntry(form({ category: "home" }), "farm", today, accounts, categories)).toThrow(/category/);
  });

  it("rejects invalid dates, amounts, categories, and accounts", () => {
    for (const date of ["", "2026-02-30", "2026-10-15"]) {
      expect(() => parseExpenseEntry(form({ date }), "home", today, accounts, categories)).toThrow();
    }
    for (const amount of ["", "0", "-1", "1.001", "10000000000"]) {
      expect(() => parseExpenseEntry(form({ amount }), "home", today, accounts, categories)).toThrow();
    }
    expect(() => parseExpenseEntry(form({ account: "closed" }), "home", today, accounts, categories)).toThrow(/Active account/);
    expect(() => parseExpenseEntry(form({ account: "" }), "home", today, accounts, categories)).toThrow(/Active account/);
    expect(() => parseExpenseEntry(form({ account: "new", date: "2026-10-09" }), "home", today, accounts, categories)).toThrow(/Account khulne/);
    expect(() => parseExpenseEntry(form({ category: "inactive" }), "farm", today, accounts, categories)).toThrow(/category/);
    expect(() => parseExpenseEntry(form({ category: "salary" }), "farm", today, accounts, categories)).toThrow(/Tankhwah/);
    expect(() => parseExpenseEntry(form({}), "home", today, accounts, categories.filter((c) => c.id !== "home"))).toThrow(/category/);
  });
});
