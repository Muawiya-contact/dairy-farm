import { expect, it } from "vitest";
import {
  finalReportRange, milkReconciliationVariance, milkShiftProduction,
} from "@/lib/final-report";
import type { MilkReportDistributionShift } from "@/lib/reporting";

it("selects current, previous, yearly, and custom report periods at Pakistan date boundaries", () => {
  expect(finalReportRange("month", "2024-03-01")).toEqual(["2024-03-01", "2024-03-01"]);
  expect(finalReportRange("previous", "2024-03-01")).toEqual(["2024-02-01", "2024-02-29"]);
  expect(finalReportRange("year", "2024-02-29")).toEqual(["2024-01-01", "2024-02-29"]);
  expect(finalReportRange("custom", "2024-02-29")).toEqual(["2024-02-29", "2024-02-29"]);
});
it("checks milk stock in hundredths of a litre", () => {
  const row = {
    opening_litres: 1.25, produced_litres: 2.75, khata_litres: 1.5, cash_litres: 0.75,
    free_litres: 0.25, farm_use_litres: 0.5, wasted_litres: 0.25, remaining_litres: 0.75,
  };
  expect(milkReconciliationVariance(row)).toBe(0);
  expect(milkReconciliationVariance({ ...row, remaining_litres: 0.76 })).toBe(-0.01);
});

it("sums saved shift production and does not invent an unsupported shift", () => {
  const rows = [
    { milk_shift: "morning", produced_litres: 1.2 },
    { milk_shift: "morning", produced_litres: 1.35 },
    { milk_shift: "noon", produced_litres: 0.5 },
    { milk_shift: "unknown", produced_litres: 99 },
  ] as MilkReportDistributionShift[];
  expect(milkShiftProduction(rows)).toEqual({ morning: 2.55, noon: 0.5, evening: 0 });
});
