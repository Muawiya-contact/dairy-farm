import { describe, expect, it } from "vitest";
import { addDays } from "../../src/lib/dates";
import { estimatedHijriDate, gyarhwinReminder, nextGyarhwinDate } from "../../src/lib/gyarhwin";

const day = nextGyarhwinDate("2026-10-15", 0)!;

describe("Gyarhwin advisory", () => {
  it("finds the next 11th Hijri day and the preceding preparation day", () => {
    expect(day).toBeTruthy();
    expect(estimatedHijriDate(day)?.day).toBe(11);
    expect(estimatedHijriDate(addDays(day, -1))?.day).toBe(10);
    expect(gyarhwinReminder(addDays(day, -1), true, 0)?.phase).toBe("prepare");
    expect(gyarhwinReminder(day, true, 0)?.phase).toBe("today");
    expect(gyarhwinReminder(addDays(day, -2), true, 0)).toBeNull();
    expect(gyarhwinReminder(addDays(day, 1), true, 0)).toBeNull();
  });

  it("respects the owner setting and local moon-sighting adjustment", () => {
    expect(gyarhwinReminder(day, false, 0)).toBeNull();
    expect(gyarhwinReminder(addDays(day, 1), true, -1)?.phase).toBe("today");
    expect(nextGyarhwinDate("2026-10-15", -1)).toBe(addDays(day, 1));
    expect(estimatedHijriDate(addDays(day, 1), -1)).toEqual(estimatedHijriDate(day));
  });

  it("rejects invalid dates and offsets rather than reporting a false reminder", () => {
    expect(() => estimatedHijriDate("2026-02-30")).toThrow(RangeError);
    expect(() => estimatedHijriDate(day, 3)).toThrow(RangeError);
    expect(() => estimatedHijriDate(day, 0.5)).toThrow(RangeError);
  });
});
