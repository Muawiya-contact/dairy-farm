import { expect, test } from "vitest";
import { milkFill } from "../src/lib/milk-fill";

test("the can fills by litres and keeps each shift proportional", () => {
  const fill = milkFill(46, 38.5);
  expect(fill.fillPercent).toBeCloseTo(84.5);
  expect(fill.morningSharePercent).toBeGreaterThan(fill.eveningSharePercent);
  expect(fill.morningSharePercent + fill.eveningSharePercent).toBeCloseTo(100);

  expect(milkFill(40, 10).eveningSharePercent).toBeCloseTo(20);
  expect(milkFill(0, 0)).toEqual({ fillPercent: 0, morningSharePercent: 0, eveningSharePercent: 0 });
  expect(milkFill(80, 40).fillPercent).toBe(100);
});
