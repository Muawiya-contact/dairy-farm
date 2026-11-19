import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import MilkReport from "@/components/MilkReport";

const reportMocks = vi.hoisted(() => ({
  loadMilkReportBounds: vi.fn(), loadMilkReportDaily: vi.fn(), loadMilkReportCustomers: vi.fn(),
  loadMilkReportTotals: vi.fn(), saveMilkDayWaste: vi.fn(), getSettings: vi.fn(),
  buildPdfReport: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));
vi.mock("@/lib/reporting", async (original) => ({ ...(await original<typeof import("@/lib/reporting")>()), ...reportMocks }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: reportMocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: reportMocks.buildPdfReport, downloadBlob: reportMocks.downloadBlob }));
vi.mock("@/lib/pdf-share", async (original) => ({ ...(await original<typeof import("@/lib/pdf-share")>()), sharePdfFile: reportMocks.sharePdfFile }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-10-16" }));

beforeEach(() => {
  reportMocks.loadMilkReportBounds.mockResolvedValue({ first_date: "2026-09-01", last_date: "2026-10-16" });
  reportMocks.loadMilkReportDaily.mockResolvedValue([{ report_date: "2026-10-16", opening_litres: 2, produced_litres: 10, available_litres: 12, sold_litres: 4, charity_litres: 2, wasted_litres: 1, waste_reason: "Balti gir gayi", closing_litres: 5 }]);
  reportMocks.loadMilkReportCustomers.mockResolvedValue([{ customer_id: "buyer-1", name: "Ali", kind: "regular", sort_order: 1, litres: 4, charged: 600, paid: 300, outstanding: 900 }]);
  reportMocks.loadMilkReportTotals.mockResolvedValue({ opening_litres: 2, produced_litres: 10, available_litres: 12, sold_litres: 4, charity_litres: 2, wasted_litres: 1, closing_litres: 5, sales_amount: 600, received_amount: 300, outstanding_amount: 900 });
  reportMocks.saveMilkDayWaste.mockResolvedValue(undefined);
  reportMocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
  reportMocks.buildPdfReport.mockResolvedValue(new Uint8Array([1, 2, 3]));
  reportMocks.downloadBlob.mockReset();
  reportMocks.sharePdfFile.mockResolvedValue("shared");
});

it("shows reconciled daily and customer results and exports the selected period", async () => {
  const user = userEvent.setup();
  renderWithQuery(<MilkReport />);
  await screen.findByRole("heading", { name: "2026-10-16 se 2026-10-16 ka grand summary" });
  expect(screen.getAllByText("5 L").length).toBeGreaterThan(1);
  expect(screen.getByRole("link", { name: "Ali" })).toHaveAttribute("href", "/reports/customer?id=buyer-1&from=2026-10-16&to=2026-10-16");
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(reportMocks.buildPdfReport).toHaveBeenCalledOnce());
  expect(reportMocks.buildPdfReport).toHaveBeenCalledWith(
    "Milk Report — 2026-10-16 se 2026-10-16",
    expect.arrayContaining([
      expect.objectContaining({ title: "Grand summary" }),
      expect.objectContaining({ title: "Daily milk balance" }),
      expect.objectContaining({ title: "Customer sales and outstanding" }),
    ]),
    "Saim Dairy Farm",
  );
  expect(reportMocks.downloadBlob).toHaveBeenCalledWith("milk-report-2026-10-16-to-2026-10-16.pdf", expect.any(Blob));
});

it("waits for the database date bounds before enabling all-records period", async () => {
  reportMocks.loadMilkReportBounds.mockImplementationOnce(() => new Promise(() => {}));
  renderWithQuery(<MilkReport />);
  expect(screen.getByRole("button", { name: "Sab record" })).toBeDisabled();
  expect(screen.getByText("Sab records ki pehli tareekh load ho rahi hai…")).toBeInTheDocument();
});

it("requires a waste reason and saves corrections through the guarded database action", async () => {
  const user = userEvent.setup();
  renderWithQuery(<MilkReport />);
  const amount = await screen.findByRole("spinbutton", { name: "Zaya doodh litre" });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Waste ki wajah" })).toHaveValue("Balti gir gayi"));
  await user.clear(amount);
  await user.type(amount, "1.5");
  await user.clear(screen.getByRole("textbox", { name: "Waste ki wajah" }));
  await user.click(screen.getByRole("button", { name: "Waste save karein" }));
  expect(screen.getByRole("textbox", { name: "Waste ki wajah" })).toHaveValue("");
  expect(await screen.findByText(/Entry save nahi hui:/)).toHaveTextContent("kam az kam 3 harf");
  expect(reportMocks.saveMilkDayWaste).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox", { name: "Waste ki wajah" }), "Do balti gir gayin");
  await user.click(screen.getByRole("button", { name: "Waste save karein" }));
  await waitFor(() => expect(reportMocks.saveMilkDayWaste).toHaveBeenCalledWith("2026-10-16", 1.5, "Do balti gir gayin"));
  expect(await screen.findByRole("status")).toHaveTextContent("Closing balance dobara calculate ho gaya");
});

it("explains and retries a farm-settings error before PDF export", async () => {
  const user = userEvent.setup();
  reportMocks.getSettings.mockRejectedValueOnce(new Error("failed to fetch"));
  renderWithQuery(<MilkReport />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Farm ki tafseel nahi mili: Internet nahi chal raha.");
  const download = screen.getByRole("button", { name: "PDF download" });
  expect(download).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Dobara koshish" }));
  await waitFor(() => expect(download).toBeEnabled());
});
