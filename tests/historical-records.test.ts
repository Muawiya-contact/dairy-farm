import { expect, test } from "vitest";
import { nextMonth } from "../src/lib/historical-records";

test("historical month filter handles December without a shifted farm day", () => {
  expect(nextMonth("2025-12")).toBe("2026-01");
  expect(nextMonth("2026-09")).toBe("2026-10");
  expect(() => nextMonth("2026-13")).toThrow();
});
