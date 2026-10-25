import { expect, test, vi } from "vitest";
import { historicalPage, nextMonth } from "../src/lib/historical-records";

const getSupabase = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/supabase", () => ({ getSupabase }));

test("historical month filter handles December without a shifted farm day", () => {
  expect(nextMonth("2025-12")).toBe("2026-01");
  expect(nextMonth("2026-09")).toBe("2026-10");
  expect(() => nextMonth("2026-13")).toThrow();
});

test("a customer history query uses the verified database link, not a name substring", async () => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "order", "range", "eq", "gte", "lt"]) query[method] = vi.fn(() => query);
  query.then = vi.fn((done: (value: unknown) => void) => done({ data: [], count: 0, error: null }));
  getSupabase.mockReturnValue({ from: () => query });
  const id = "11111111-1111-4111-8111-111111111111";
  await historicalPage("milk_day", "2026-09", 0, "", id);
  expect(query.eq).toHaveBeenCalledWith("customer_id", id);
  expect(query.eq).toHaveBeenCalledWith("kind", "milk_day");
  await expect(historicalPage("all", "", 0, "", "bad-id")).rejects.toThrow();
});
