import { expect, it } from "vitest";
import { monthBounds } from "../../src/lib/galla";

it("uses exclusive month bounds across year rollover", () => {
  expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-11-01" });
  expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  expect(() => monthBounds("2026-13")).toThrow();
});
