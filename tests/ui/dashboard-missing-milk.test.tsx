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

it("compares yesterday only after both shifts are entered, including real zero entries", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ ...base, shifts: [
    { id: "morning", milk_date: "2026-10-16", shift: "morning", total_litres: 0 },
    { id: "evening", milk_date: "2026-10-16", shift: "evening", total_litres: 0 },
    { id: "yesterday", milk_date: "2026-10-15", shift: "morning", total_litres: 10 },
  ] }), error: null });
  renderWithQuery(<FarmDashboard />);
  expect(screen.getByText(/Kal se 10 L kam/)).toBeInTheDocument();
  expect(screen.queryByText("Aaj ka doodh abhi nahi likha")).not.toBeInTheDocument();
});
