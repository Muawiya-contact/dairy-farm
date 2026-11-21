import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, formatDay, todayPK } from "@/lib/dates";
import type { InactiveCustomer } from "@/lib/inactive-customers";
import InactiveCustomersReport from "@/components/InactiveCustomersReport";
import { renderWithQuery } from "./utils";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  getSettings: vi.fn(),
  buildPdf: vi.fn(),
  buildXlsx: vi.fn(),
  downloadBlob: vi.fn(),
  downloadFile: vi.fn(),
  toCsv: vi.fn(),
}));

vi.mock("@/lib/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reporting")>()),
  loadInactiveCustomers: mocks.load,
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

function row(index: number): InactiveCustomer {
  return {
    customer_id: "customer-" + index,
    name: "Inactive " + String(index).padStart(2, "0"),
    phone: index === 1 ? "+923001234567" : null,
    kind: index % 2 ? "regular" : "company",
    active: true,
    sort_order: index,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(Array.from({ length: 27 }, (_, index) => row(index + 1)));
  mocks.getSettings.mockResolvedValue({ farm_name: "Demo Dairy" });
  mocks.buildPdf.mockResolvedValue(new Uint8Array([1]));
  mocks.buildXlsx.mockResolvedValue(new Uint8Array([1]));
  mocks.toCsv.mockReturnValue("csv");
});

it("loads the chosen lookback and supports search, sorting, paging, and customer statement links", async () => {
  const user = userEvent.setup();
  renderWithQuery(<InactiveCustomersReport />);
  await screen.findByRole("link", { name: "Inactive 01" });
  const today = todayPK();

  expect(mocks.load).toHaveBeenCalledWith(addDays(today, -29), today);
  expect(screen.getByText(/Sales ki jaanch/)).toHaveTextContent(formatDay(addDays(today, -29)));
  expect(screen.getByRole("status")).toHaveTextContent("27 customers · Safha 1 / 2");
  expect(screen.getByRole("link", { name: "Inactive 01" }).getAttribute("href")).toContain("customer-1");

  await user.selectOptions(screen.getByRole("combobox", { name: "No-purchase lookback" }), "90");
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(addDays(today, -89), today));
  await user.selectOptions(screen.getByRole("combobox", { name: "Inactive customer sort" }), "kind");
  await user.selectOptions(screen.getByRole("combobox", { name: "Inactive customer sort" }), "name");
  await user.click(screen.getByRole("button", { name: "Ulti tarteeb lagayein" }));
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("link")[0]).toHaveTextContent("Inactive 27");

  const search = screen.getByRole("searchbox", { name: "Inactive customer search" });
  await user.type(search, "inactive 26");
  expect(within(table).getByRole("link", { name: "Inactive 26" })).toBeInTheDocument();
  expect(within(table).queryByRole("link", { name: "Inactive 01" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 customers · Safha 1 / 1");

  await user.clear(search);
  await user.type(search, "0300 123 4567");
  expect(within(table).getByRole("link", { name: "Inactive 01" })).toBeInTheDocument();
  expect(within(table).queryByRole("link", { name: "Inactive 02" })).not.toBeInTheDocument();
});

it("exports all filtered inactive customers in PDF, CSV, and Excel and prepares print", async () => {
  const user = userEvent.setup();
  renderWithQuery(<InactiveCustomersReport />);
  await screen.findByRole("link", { name: "Inactive 01" });
  await user.type(screen.getByRole("searchbox", { name: "Inactive customer search" }), "inactive 2");

  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(mocks.buildPdf).toHaveBeenCalledOnce());
  const [title, sections, farmName] = mocks.buildPdf.mock.calls[0];
  expect(title).toContain("Inactive Customers");
  expect(farmName).toBe("Demo Dairy");
  expect(sections[1].rows).toHaveLength(8);
  expect(sections[1].rows[0].name).toBe("Inactive 20");

  await user.click(screen.getByRole("button", { name: "CSV download" }));
  await waitFor(() => expect(mocks.downloadFile).toHaveBeenCalledOnce());
  expect(mocks.toCsv.mock.calls[0][1]).toHaveLength(8);
  await user.click(screen.getByRole("button", { name: "Excel download" }));
  await waitFor(() => expect(mocks.buildXlsx).toHaveBeenCalledOnce());
  expect(mocks.buildXlsx.mock.calls[0][2]).toHaveLength(8);

  const print = vi.fn();
  Object.defineProperty(window, "print", { configurable: true, value: print });
  fireEvent.click(screen.getByRole("button", { name: "Print karein" }));
  expect(print).toHaveBeenCalledOnce();
  expect(await screen.findByText("Print ke liye report tayyar hai.")).toBeInTheDocument();
});

it("shows retryable errors and a truthful empty state", async () => {
  mocks.load.mockRejectedValueOnce(new Error("offline"));
  renderWithQuery(<InactiveCustomersReport />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Customer report nahi khuli");

  mocks.load.mockResolvedValueOnce([]);
  await userEvent.setup().click(screen.getByRole("button", { name: "Dobara koshish" }));
  expect(await screen.findByText("Is muddat mein koi inactive paying customer nahi mila.")).toBeInTheDocument();
});
