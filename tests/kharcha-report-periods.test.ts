import { expect, it } from "vitest";
import { isKharchaReportDateRange, kharchaMonthRange, kharchaYearRange } from "../src/lib/kharcha-report";

const today = "2026-10-16";

it("uses complete past months and caps the current month at the farm day", () => {
  expect(kharchaMonthRange("2026-09", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(kharchaMonthRange("2026-10", today)).toEqual({ from: "2026-10-01", to: today });
  expect(kharchaMonthRange("2026-11", today)).toEqual({ from: "2026-11-01", to: "" });
});

it("uses complete past years and caps the current year at the farm day", () => {
  expect(kharchaYearRange("2025", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  expect(kharchaYearRange("2026", today)).toEqual({ from: "2026-01-01", to: today });
  expect(kharchaYearRange("2027", today)).toEqual({ from: "2027-01-01", to: "" });
});

it("accepts the full available history and rejects invalid, reversed, or future dates", () => {
  expect(isKharchaReportDateRange("2010-01-01", today, today)).toBe(true);
  expect(isKharchaReportDateRange("2026-10-10", "2026-10-10", today)).toBe(true);
  expect(isKharchaReportDateRange("2026-10-11", "2026-10-10", today)).toBe(false);
  expect(isKharchaReportDateRange("2026-10-01", "2026-10-17", today)).toBe(false);
  expect(isKharchaReportDateRange("2026-02-30", today, today)).toBe(false);
});
