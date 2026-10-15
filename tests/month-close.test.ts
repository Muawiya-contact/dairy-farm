import { expect, test } from "vitest";
import { previousMonth, validateMonthClose } from "../src/lib/month-close";

test("month close only accepts a complete past month", () => {
  expect(previousMonth("2027-01-15")).toBe("2026-12");
  expect(previousMonth("2026-10-15")).toBe("2026-09");
  expect(validateMonthClose("2026-09", "2026-10-15")).toBeNull();
  expect(validateMonthClose("2026-10", "2026-10-15")).toContain("guzra hua");
  expect(validateMonthClose("2026-11", "2026-10-15")).toContain("guzra hua");
  expect(validateMonthClose("2026-13", "2026-10-15")).toContain("Sahi maheena");
});
