import { describe, expect, it } from "vitest";
import { addDays, dayNameUr, daysBetween, formatDay, formatMonth, monthStart, todayPK } from "../../src/lib/dates";

describe("Pakistan farm dates", () => {
  it("uses the Pakistan day at the UTC boundary", () => {
    expect(todayPK(new Date("2026-10-10T18:59:00Z"))).toBe("2026-10-10");
    expect(todayPK(new Date("2026-10-10T19:30:00Z"))).toBe("2026-10-11");
  });

  it("uses civil dates across leap days, months, and years", () => {
    expect(addDays("2026-02-02", 270)).toBe("2026-10-30");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(monthStart("2026-10-31")).toBe("2026-10-01");
  });

  it("formats independent of the browser timezone", () => {
    expect(formatDay("2026-10-11")).toBe("11 Oct 2026");
    expect(formatMonth("2026-10-11")).toBe("October 2026");
    expect(dayNameUr("2026-10-11")).toBe("Itwaar");
  });

  it("rejects impossible dates", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => daysBetween("2026-01-01", "invalid")).toThrow(RangeError);
  });
});
