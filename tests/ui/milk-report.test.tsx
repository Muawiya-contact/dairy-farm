import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import MilkReport from "@/components/MilkReport";

const reportMocks = vi.hoisted(() => ({
  loadMilkReportBounds: vi.fn(), loadMilkReportDaily: vi.fn(), loadMilkReportCustomers: vi.fn(),
  loadMilkReportTotals: vi.fn(), loadMilkReportDistributionDaily: vi.fn(), loadMilkReportDistributionShifts: vi.fn(),
  loadMilkReportDistributionTotals: vi.fn(), saveMilkDayWaste: vi.fn(), getSettings: vi.fn(),
  buildPdfReport: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));
vi.mock("@/lib/reporting", async (original) => ({ ...(await original<typeof import("@/lib/reporting")>()), ...reportMocks }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: reportMocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: reportMocks.buildPdfReport, downloadBlob: reportMocks.downloadBlob }));
vi.mock("@/lib/pdf-share", async (original) => ({ ...(await original<typeof import("@/lib/pdf-share")>()), sharePdfFile: reportMocks.sharePdfFile }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-10-16" }));

beforeEach(() => {
  reportMocks.loadMilkReportBounds.mockResolvedValue({ first_date: "2026-09-01", last_date: "2026-10-16" });
  reportMocks.loadMilkReportDaily.mockResolvedValue([{ report_date: "2026-10-16", opening_litres: 2, produced_litres: 10, available_litres: 12, sold_litres: 4, charity_litres: 2, farm_use_litres: 0, wasted_litres: 1, waste_reason: "Balti gir gayi", day_wasted_litres: 1, day_waste_reason: "Balti gir gayi", closing_litres: 5 }]);
  reportMocks.loadMilkReportDistributionDaily.mockResolvedValue([{
    report_date: "2026-10-16", opening_litres: 2, produced_litres: 10, available_litres: 12,
    khata_litres: 4, cash_litres: 0, free_litres: 2, farm_use_litres: 0, wasted_litres: 1,
    allocated_litres: 7, remaining_litres: 5, khata_delivery_amount: 600, company_bill_amount: 0, khata_amount: 600, cash_sale_amount: 0, total_sales_amount: 600,
    cash_received: 300, galla_cash_received: 0, free_details: [], farm_use_details: [], waste_details: [],
  }]);
  reportMocks.loadMilkReportDistributionShifts.mockResolvedValue([{
    report_date: "2026-10-16", milk_shift: "morning", produced_litres: 10, khata_litres: 4, cash_litres: 0,
    free_litres: 2, farm_use_litres: 0, wasted_litres: 0, allocated_litres: 6, remaining_litres: 4,
    khata_delivery_amount: 600, cash_sale_amount: 0, cash_received: 0, galla_cash_received: 0,
    free_details: [], farm_use_details: [], waste_details: [],
  }]);
  reportMocks.loadMilkReportCustomers.mockResolvedValue([{ customer_id: "buyer-1", name: "Ali", kind: "regular", sort_order: 1, litres: 4, charged: 600, paid: 300, outstanding: 900 }]);
  reportMocks.loadMilkReportTotals.mockResolvedValue({ opening_litres: 2, produced_litres: 10, available_litres: 12, sold_litres: 4, charity_litres: 2, farm_use_litres: 0, wasted_litres: 1, closing_litres: 5, sales_amount: 600, received_amount: 300, outstanding_amount: 900 });
  reportMocks.loadMilkReportDistributionTotals.mockResolvedValue({
    opening_litres: 2, produced_litres: 10, available_litres: 12, khata_litres: 4, cash_litres: 0,
    free_litres: 2, farm_use_litres: 0, wasted_litres: 1, allocated_litres: 7, closing_litres: 5,
    khata_delivery_amount: 600, company_bill_amount: 0, khata_amount: 600, cash_sale_amount: 0, total_sales_amount: 600, cash_received: 300,
    galla_cash_received: 0, outstanding_khata_amount: 900,
  });
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
      expect.objectContaining({ title: "Daily milk distribution and collections", repeatColumns: ["report_date"] }),
      expect.objectContaining({ title: "Shift distribution and collections", repeatColumns: ["report_date", "milk_shift"] }),
      expect.objectContaining({ title: "Customer sales and outstanding" }),
    ]),
    "Saim Dairy Farm",
  );
  expect(screen.getByText("Rozana doodh ki taqseem aur wasooli")).toBeInTheDocument();
  expect(screen.getByText("Shift-wise milk distribution")).toBeInTheDocument();
  expect(screen.getByText("Subah")).toBeInTheDocument();
  expect(screen.queryByText("morning")).not.toBeInTheDocument();
  expect(screen.getAllByText("Rs 900").length).toBeGreaterThan(0);
  expect(reportMocks.buildPdfReport.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "Grand summary", rows: expect.arrayContaining([expect.objectContaining({ item: "Khata billed", value: "Rs 600" })]) }),
    expect.objectContaining({ title: "Daily milk distribution and collections", rows: expect.arrayContaining([expect.objectContaining({ khata_litres: "4 L", cash_received: "Rs 300" })]) }),
    expect.objectContaining({ title: "Shift distribution and collections", rows: expect.arrayContaining([expect.objectContaining({ milk_shift: "Subah", khata_delivery_amount: "Rs 600" })]) }),
  ]));
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
  const amount = await screen.findByRole("spinbutton", { name: "Shift ke baghair waste litre" });
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
