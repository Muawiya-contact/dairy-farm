import { expect, test } from "vitest";
import { countMissingMilkShifts, previousMonth, recentClosedMonths, sameMonthCloseSummary, shouldRemindCloseMonth, validateMonthClose } from "../src/lib/month-close";

test("month close only accepts a complete past month", () => {
  expect(previousMonth("2027-01-15")).toBe("2026-12");
  expect(previousMonth("2026-10-15")).toBe("2026-09");
  expect(validateMonthClose("2026-09", "2026-10-15")).toBeNull();
  expect(validateMonthClose("2026-10", "2026-10-15")).toContain("guzra hua");
  expect(validateMonthClose("2026-11", "2026-10-15")).toContain("guzra hua");
  expect(validateMonthClose("2026-13", "2026-10-15")).toContain("Sahi maheena");
});

test("recent months, missing shifts and gentle reminder use the Pakistan farm day", () => {
  expect(recentClosedMonths("2027-01-15").slice(0, 2)).toEqual(["2026-12", "2026-11"]);
  expect(recentClosedMonths("2027-01-15")).toHaveLength(12);
  expect(shouldRemindCloseMonth("2026-10-10", [], "2026-09-12")).toBe(false);
  expect(shouldRemindCloseMonth("2026-10-11", [], "2026-09-12")).toBe(true);
  expect(shouldRemindCloseMonth("2026-10-11", [{ month: "2026-09-01" }], "2026-09-12")).toBe(false);
  expect(shouldRemindCloseMonth("2026-10-11", [], "2026-10-01")).toBe(false);
  expect(countMissingMilkShifts("2026-09-01", "2026-09-04", "2026-09-02", [
    { milk_date: "2026-09-02", shift: "morning" }, { milk_date: "2026-09-03", shift: "evening" },
  ])).toBe(2);
});

test("a changed monthly total or missing shift invalidates the owner's review", () => {
  const reviewed = { produced: 120, sales: 21000, expenses: 5000, profit: 16000, gallaClosing: 9000, missingShifts: 0 };
  expect(sameMonthCloseSummary(reviewed, { ...reviewed })).toBe(true);
  expect(sameMonthCloseSummary(reviewed, { ...reviewed, sales: 21100 })).toBe(false);
  expect(sameMonthCloseSummary(reviewed, { ...reviewed, missingShifts: 1 })).toBe(false);
});
