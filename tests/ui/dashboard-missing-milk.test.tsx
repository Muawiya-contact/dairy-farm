import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { farmMocks, makeFarmData, renderWithQuery } from "./utils";
import FarmDashboard from "@/components/FarmDashboard";

vi.mock("@/components/FarmObservances", () => ({ FarmObservances: () => null }));
vi.mock("@/components/ProfitChart", () => ({ default: () => null }));
vi.mock("@/lib/month-close", async (original) => ({ ...(await original<typeof import("@/lib/month-close")>()),
  shouldRemindCloseMonth: () => false,
}));

const base = { settings: { owner_name: "Maalik", go_live_date: "2026-10-01" }, alerts: [],
  monthlyPnl: [], expenses: [], categories: [], companyBills: [], otherIncome: [], deliveries: [], animalStatus: [] };

it("shows a milk entry link instead of comparing an unentered shift with yesterday", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ ...base, shifts: [
    { id: "yesterday", milk_date: "2026-10-15", shift: "morning", total_litres: 10 },
  ] }), error: null });
  renderWithQuery(<FarmDashboard />);
  expect(screen.getByText("Aaj ka doodh abhi nahi likha")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Doodh likhein" })).toHaveAttribute("href", "/doodh");
  expect(screen.queryByText(/Kal se/)).not.toBeInTheDocument();
});

it("compares only two complete days, including real zero entries", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ ...base, milkShiftConfig: [{ effective_from: "2026-10-16", noon_enabled: false }], shifts: [
    { id: "morning", milk_date: "2026-10-16", shift: "morning", total_litres: 0 },
    { id: "evening", milk_date: "2026-10-16", shift: "evening", total_litres: 0 },
    { id: "yesterday", milk_date: "2026-10-15", shift: "morning", total_litres: 10 },
    { id: "yesterday-evening", milk_date: "2026-10-15", shift: "evening", total_litres: 0 },
  ] }), error: null });
  renderWithQuery(<FarmDashboard />);
  expect(screen.getByText(/Kal se 10 L kam/)).toBeInTheDocument();
  expect(screen.queryByText("Aaj ka doodh abhi nahi likha")).not.toBeInTheDocument();
});

it("shows yesterday's carried milk as chiller stock, separate from income", async () => {
  farmMocks.loadMilkDayDistribution.mockResolvedValueOnce({
    report_date: "2026-10-16", opening_litres: 4219, produced_litres: 500, available_litres: 4719,
    khata_litres: 0, cash_litres: 0, free_litres: 0, farm_use_litres: 0, wasted_litres: 0,
    allocated_litres: 0, remaining_litres: 4719, khata_amount: 0, cash_sale_amount: 0, cash_received: 0, shifts: [],
  });
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ ...base, shifts: [
    { id: "morning", milk_date: "2026-10-16", shift: "morning", total_litres: 500 },
  ] }), error: null });
  renderWithQuery(<FarmDashboard />);
  expect(await screen.findByText("Chiller ka pichla doodh (income nahi)")).toBeVisible();
  expect(screen.getByText("4,219 L")).toBeVisible();
  expect(screen.getByText("4,719 L")).toBeVisible();
});
