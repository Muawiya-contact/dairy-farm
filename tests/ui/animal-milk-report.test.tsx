import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import AnimalMilkReport from "@/components/AnimalMilkReport";

const reportMocks = vi.hoisted(() => ({
  loadMilkReportBounds: vi.fn(), loadMilkReportAnimalOptions: vi.fn(), loadMilkReportAnimals: vi.fn(),
  loadMilkReportAnimalSummary: vi.fn(), getSettings: vi.fn(), buildPdfReport: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));
vi.mock("@/lib/reporting", async (original) => ({ ...(await original<typeof import("@/lib/reporting")>()), ...reportMocks }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: reportMocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: reportMocks.buildPdfReport, downloadBlob: reportMocks.downloadBlob }));
vi.mock("@/lib/pdf-share", async (original) => ({ ...(await original<typeof import("@/lib/pdf-share")>()), sharePdfFile: reportMocks.sharePdfFile }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-10-16" }));

beforeEach(() => {
  reportMocks.loadMilkReportBounds.mockResolvedValue({ first_date: "2026-09-01", last_date: "2026-10-16" });
  reportMocks.loadMilkReportAnimalOptions.mockResolvedValue([{ id: "animal-1", tag: "101", name: "Gaye 101" }]);
  reportMocks.loadMilkReportAnimals.mockResolvedValue([{ report_date: "2026-10-16", animal_id: "animal-1", tag: "101", name: "Gaye 101", morning_litres: 3, noon_litres: 2, evening_litres: 1, total_litres: 6 }]);
  reportMocks.loadMilkReportAnimalSummary.mockResolvedValue([
    { animal_id: "animal-1", tag: "101", name: "Gaye 101", morning_litres: 3, noon_litres: 2, evening_litres: 1, total_litres: 6, recorded_days: 1, is_grand_total: false },
    { animal_id: null, tag: "—", name: "Grand Total", morning_litres: 3, noon_litres: 2, evening_litres: 1, total_litres: 6, recorded_days: 1, is_grand_total: true },
  ]);
  reportMocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
  reportMocks.buildPdfReport.mockResolvedValue(new Uint8Array([1, 2, 3]));
  reportMocks.downloadBlob.mockReset();
  reportMocks.sharePdfFile.mockResolvedValue("shared");
});

it("filters by animal tag and exports shift totals with date-wise records", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalMilkReport />);
  await screen.findByRole("heading", { name: "All animals ka grand summary" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Janwar ka tag number" }), "animal-1");
  await waitFor(() => expect(reportMocks.loadMilkReportAnimals).toHaveBeenCalledWith("2026-10-16", "2026-10-16", "animal-1"));
  expect(screen.getAllByText("101").length).toBeGreaterThan(1);
  expect(screen.getByRole("link", { name: "Customer / Overall Milk Report kholein" })).toHaveAttribute("href", "/reports/milk");
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(reportMocks.buildPdfReport).toHaveBeenCalledOnce());
  expect(reportMocks.buildPdfReport).toHaveBeenCalledWith(
    "Animal Milk Report — 101 — 2026-10-16 se 2026-10-16",
    expect.arrayContaining([
      expect.objectContaining({ title: "Animal summary · 101" }),
      expect.objectContaining({ title: "Daily production" }),
    ]),
    "Saim Dairy Farm",
  );
  expect(reportMocks.downloadBlob).toHaveBeenCalledOnce();
});

it("explains and retries a farm-settings error before PDF export", async () => {
  const user = userEvent.setup();
  reportMocks.getSettings.mockRejectedValueOnce(new Error("failed to fetch"));
  renderWithQuery(<AnimalMilkReport />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Farm ki tafseel nahi mili: Internet nahi chal raha.");
  const download = screen.getByRole("button", { name: "PDF download" });
  expect(download).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Dobara koshish" }));
  await waitFor(() => expect(download).toBeEnabled());
});
