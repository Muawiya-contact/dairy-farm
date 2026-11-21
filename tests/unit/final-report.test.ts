import { expect, it } from "vitest";
import {
  buildFinalReportAnalytics, finalReportExportSections, finalReportRange, milkReconciliationVariance, milkShiftProduction,
} from "@/lib/final-report";
import type { FinalReportData } from "@/lib/final-report";
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

it("ranks saved customers, animal production, and expenses and combines production with financial buckets", () => {
  const data = {
    financial: {
      trends: [
        { bucket_start: "2026-11-01", total_income: 1500, farm_expenses: 450, net_profit: 1050 },
        { bucket_start: "2026-12-01", total_income: 2000, farm_expenses: 1000, net_profit: 1000 },
      ],
      period: { farmName: "Analytics Dairy", summary: { milk_income: 0, other_income: 0, farm_expenses: 0, home_expenses: 0, profit: 0, cash_collected: 0 }, expenses: [] },
      accounts: [], salaryPayables: [], otherIncome: [],
    },
    milk: {
      daily: [
        { report_date: "2026-11-01", produced_litres: 10, khata_litres: 6, cash_litres: 2, opening_litres: 0, available_litres: 10, free_litres: 0, farm_use_litres: 0, wasted_litres: 0, allocated_litres: 8, remaining_litres: 2, khata_amount: 0, cash_sale_amount: 0, cash_received: 0, galla_cash_received: 0 },
        { report_date: "2026-11-02", produced_litres: 5, khata_litres: 3, cash_litres: 1, opening_litres: 2, available_litres: 7, free_litres: 0, farm_use_litres: 0, wasted_litres: 0, allocated_litres: 4, remaining_litres: 3, khata_amount: 0, cash_sale_amount: 0, cash_received: 0, galla_cash_received: 0 },
        { report_date: "2026-12-01", produced_litres: 20, khata_litres: 10, cash_litres: 4, opening_litres: 3, available_litres: 23, free_litres: 0, farm_use_litres: 0, wasted_litres: 0, allocated_litres: 14, remaining_litres: 9, khata_amount: 0, cash_sale_amount: 0, cash_received: 0, galla_cash_received: 0 },
      ],
      shifts: [],
      totals: { opening_litres: 0, produced_litres: 35, available_litres: 35, khata_litres: 19, cash_litres: 7, free_litres: 0, farm_use_litres: 0, wasted_litres: 0, allocated_litres: 26, closing_litres: 9, total_sales_amount: 0, cash_sale_amount: 0 },
      animals: [
        { animal_id: "animal-1", tag: "A-1", name: "Pehli", total_litres: 20, recorded_days: 2, is_grand_total: false },
        { animal_id: "animal-2", tag: "A-2", name: "Doosri", total_litres: 30, recorded_days: 3, is_grand_total: false },
        { animal_id: "animal-3", tag: "A-3", name: "Bina doodh", total_litres: 0, recorded_days: 1, is_grand_total: false },
        { animal_id: null, tag: "—", name: "Grand Total", total_litres: 50, recorded_days: 3, is_grand_total: true },
      ],
    },
    khata: [
      { customer_id: "customer-1", name: "Ali", charges: 200, is_grand_total: false },
      { customer_id: "customer-2", name: "Babar", charges: 500, is_grand_total: false },
      { customer_id: null, name: "Grand total", charges: 700, is_grand_total: true },
    ],
    ownerTransfers: { total_withdrawals: 0, total_deposits: 0, net_amount: 0, withdrawal_count: 0, deposit_count: 0 },
    cashPosition: { closing_cash_bank_balance: null, cash_bank_account_count: 0 },
    expenses: [
      { category: "Feed", amount: 400, entries: 2, is_farm_cost: true },
      { category: "Home bill", amount: 500, entries: 1, is_farm_cost: false },
    ],
  } as unknown as FinalReportData;

  const analytics = buildFinalReportAnalytics(data, "2026-11-01", "2027-02-01");
  expect(analytics.trendBucket).toBe("month");
  expect(analytics.trends).toEqual([
    { bucket_start: "2026-11-01", produced_litres: 15, sold_litres: 12, total_income: 1500, farm_expenses: 450, net_profit: 1050 },
    { bucket_start: "2026-12-01", produced_litres: 20, sold_litres: 14, total_income: 2000, farm_expenses: 1000, net_profit: 1000 },
  ]);
  expect(analytics.topAnimals.map((row) => row.tag)).toEqual(["A-2", "A-1"]);
  expect(analytics.averageRecordedAnimalDayLitres).toBeCloseTo(50 / 6);
  expect(analytics.recordedAnimalDays).toBe(6);
  expect(analytics.topCustomers.map((row) => row.name)).toEqual(["Babar", "Ali"]);
  expect(analytics.topExpenseCategories.map((row) => row.category)).toEqual(["Home bill", "Feed"]);

  const sections = finalReportExportSections(data, "2026-11-01", "2027-02-01", "2027-02-01");
  expect(sections.find((section) => section.title === "Maahwar farm trend")?.rows).toContainEqual(expect.objectContaining({ bucket_start: "2026-12-01", produced_litres: 20, total_income: 2000 }));
  expect(sections.find((section) => section.title === "Sab se zyada doodh dene walay janwar")?.rows[0]).toMatchObject({ tag: "A-2", litres: 30 });
  expect(sections.find((section) => section.title === "Sab se zyada billed customers")?.rows[0]).toMatchObject({ customer: "Babar", charges: 500 });
});

it("keeps short-range financial trend buckets daily and handles missing animal-level data", () => {
  const data = {
    financial: { trends: [{ bucket_start: "2026-11-01", total_income: 0, farm_expenses: 0, net_profit: 0 }] },
    milk: { daily: [{ report_date: "2026-11-01", produced_litres: 0, khata_litres: 0, cash_litres: 0 }], animals: [] },
    khata: [], expenses: [],
  } as unknown as FinalReportData;

  const analytics = buildFinalReportAnalytics(data, "2026-11-01", "2026-11-30");
  expect(analytics.trendBucket).toBe("day");
  expect(analytics.averageRecordedAnimalDayLitres).toBeNull();
  expect(analytics.topAnimals).toEqual([]);
});

it("switches the trend bucket at a 90-day date difference", () => {
  const data = { financial: { trends: [] }, milk: { daily: [], animals: [] }, khata: [], expenses: [] } as unknown as FinalReportData;

  expect(buildFinalReportAnalytics(data, "2026-01-01", "2026-03-31").trendBucket).toBe("day");
  expect(buildFinalReportAnalytics(data, "2026-01-01", "2026-04-01").trendBucket).toBe("month");
});
