import { expect, test } from "vitest";
import { isReportDateRange } from "../../src/lib/reporting";

test("report date ranges require a real ordered period through the farm day", () => {
  expect(isReportDateRange("2026-01-01", "2026-11-14", "2026-11-14")).toBe(true);
  expect(isReportDateRange("2026-11-15", "2026-11-15", "2026-11-14")).toBe(false);
  expect(isReportDateRange("2026-11-14", "2026-11-13", "2026-11-14")).toBe(false);
  expect(isReportDateRange("14/11/2026", "2026-11-14", "2026-11-14")).toBe(false);
});
