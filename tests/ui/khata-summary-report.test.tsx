import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KhataPeriodCustomer } from "@/lib/reporting";
import KhataSummaryReport from "@/components/KhataSummaryReport";
import { addDays, todayPK } from "@/lib/dates";
import { renderWithQuery } from "./utils";

const mocks = vi.hoisted(() => ({
  loadSummary: vi.fn(),
  loadYearly: vi.fn(),
  getSettings: vi.fn(),
  buildPdf: vi.fn(),
  buildXlsx: vi.fn(),
  downloadBlob: vi.fn(),
  downloadFile: vi.fn(),
  toCsv: vi.fn(),
}));

vi.mock("@/lib/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reporting")>()),
  loadKhataPeriodSummary: mocks.loadSummary,
  loadKhataYearMonthSummary: mocks.loadYearly,
}));
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  getSettings: mocks.getSettings,
}));
vi.mock("@/lib/export-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export-data")>()),
  buildPdfReport: mocks.buildPdf,
  buildXlsx: mocks.buildXlsx,
  downloadBlob: mocks.downloadBlob,
  downloadFile: mocks.downloadFile,
  toCsv: mocks.toCsv,
}));

function row(index: number): KhataPeriodCustomer {
  return {
    customer_id: `customer-${index}`,
    name: `Customer ${String(index).padStart(2, "0")}`,
    kind: "regular",
    active: true,
    sort_order: index,
    litres: index,
    charges: index * 100,
    payments: index * 50,
    discounts: 0,
    refunds: 0,
    balance_adjustments: 0,
    opening_balance: 0,
    opening_added: 0,
    closing_balance: index * 50,
  };
}

describe("KhataSummaryReport customer table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSummary.mockResolvedValue(Array.from({ length: 27 }, (_, index) => row(index + 1)));
    mocks.loadYearly.mockResolvedValue([]);
    mocks.getSettings.mockResolvedValue({ farm_name: "Demo Dairy" });
    mocks.buildPdf.mockResolvedValue(new Uint8Array([1]));
    mocks.buildXlsx.mockResolvedValue(new Uint8Array([1]));
    mocks.toCsv.mockReturnValue("csv");
  });

  it("searches, sorts, and paginates without changing the all-customer grand total", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KhataSummaryReport title="Customer Report" />);

    await screen.findAllByRole("table");
    expect(within(screen.getAllByRole("table")[0]).getByRole("link", { name: "Customer 01" })).toBeInTheDocument();
    expect(within(screen.getAllByRole("table")[0]).queryByRole("link", { name: "Customer 26" })).not.toBeInTheDocument();
    expect(screen.getByText("Safha 1 / 2 · 27 customers")).toBeInTheDocument();
    const grandSummary = screen.getByRole("heading", { name: /grand total — tamam customers/ }).closest("section");
    expect(within(grandSummary!).getByText("378 L")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Customer summary sort" }), "closing_balance");
    await user.click(screen.getByRole("button", { name: "Ulti tarteeb lagayein" }));
    const table = screen.getAllByRole("table")[0];
    expect(within(table).getAllByRole("link")[0]).toHaveTextContent("Customer 27");

    await user.click(screen.getByRole("button", { name: "Agla safha" }));
    expect(within(screen.getAllByRole("table")[0]).getByRole("link", { name: "Customer 02" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Customer summary search" }), "customer 26");
    expect(within(screen.getAllByRole("table")[0]).getByRole("link", { name: "Customer 26" })).toBeInTheDocument();
    expect(within(screen.getAllByRole("table")[0]).queryByRole("link", { name: "Customer 01" })).not.toBeInTheDocument();
    expect(screen.getByText("Safha 1 / 1 · 1 customers")).toBeInTheDocument();
  });

  it("exports all filtered rows, not only the current page, with a matching total row", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KhataSummaryReport title="Customer Report" />);
    await screen.findAllByRole("table");

    await user.click(screen.getByRole("button", { name: "CSV download" }));
    await waitFor(() => expect(mocks.downloadFile).toHaveBeenCalled());
    const csvRows = mocks.toCsv.mock.calls[0][1] as Record<string, unknown>[];
    expect(csvRows).toHaveLength(28);
    expect(csvRows[0]).toMatchObject({ name: "Customer 01", litres: 1 });
    expect(csvRows[26]).toMatchObject({ name: "Customer 27", litres: 27 });
    expect(csvRows[27]).toMatchObject({ name: "Kul (filter ke mutabiq)", litres: 378, charges: 37800 });

    await user.click(screen.getByRole("button", { name: "Excel download" }));
    await waitFor(() => expect(mocks.downloadBlob).toHaveBeenCalled());
    expect(mocks.buildXlsx).toHaveBeenCalledWith("Customer Report", expect.any(Array), expect.any(Array));
  });

  it("offers yesterday and labels the bounded history preset accurately", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KhataSummaryReport />);
    await screen.findAllByRole("table");
    const today = todayPK();
    const yesterday = addDays(today, -1);

    await user.click(screen.getByRole("button", { name: "Kal" }));
    expect(screen.getByLabelText("Khata summary shuru ki tareekh")).toHaveValue(yesterday);
    expect(screen.getByLabelText("Khata summary aakhir ki tareekh")).toHaveValue(yesterday);
    await waitFor(() => expect(mocks.loadSummary).toHaveBeenCalledWith(yesterday, yesterday));

    expect(screen.getByRole("button", { name: "Aakhri 10 saal" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aakhri 10 saal" }));
    expect(screen.getByLabelText("Khata summary shuru ki tareekh")).toHaveValue(addDays(today, -3660));
    expect(screen.getByLabelText("Khata summary aakhir ki tareekh")).toHaveValue(today);
  });
});
