import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import KharchaReport from "@/components/KharchaReport";

const mocks = vi.hoisted(() => ({
  loadKharchaReportBounds: vi.fn(), loadKharchaReportSummary: vi.fn(), loadKharchaReportCategories: vi.fn(),
  loadKharchaReportPeople: vi.fn(), loadKharchaReportRows: vi.fn(), loadAllKharchaReportRows: vi.fn(),
  getSettings: vi.fn(), buildPdfReport: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));
vi.mock("@/lib/kharcha-report", async (original) => ({ ...(await original<typeof import("@/lib/kharcha-report")>()), ...mocks }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: mocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: mocks.buildPdfReport, downloadBlob: mocks.downloadBlob }));
vi.mock("@/lib/pdf-share", async (original) => ({ ...(await original<typeof import("@/lib/pdf-share")>()), sharePdfFile: mocks.sharePdfFile }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-10-16" }));

const row = {
  expense_id: "expense-1", expense_date: "2026-10-12", description: "School fee", category: "Ghar ka kharcha",
  account: "Cash", expense_type: "home" as const, amount: 50, recipient: "Sana",
};

beforeEach(() => {
  mocks.loadKharchaReportBounds.mockResolvedValue({ first_date: "2010-01-01", last_date: "2026-10-16" });
  mocks.loadKharchaReportSummary.mockResolvedValue({ entry_count: 1, total_expenses: 50, farm_expenses: 0, home_expenses: 50, personal_expenses: 0 });
  mocks.loadKharchaReportCategories.mockResolvedValue([{ category: "Ghar ka kharcha", expense_type: "home", entry_count: 1, total_amount: 50 }]);
  mocks.loadKharchaReportPeople.mockResolvedValue(["Sana"]);
  mocks.loadKharchaReportRows.mockResolvedValue([row]);
  mocks.loadAllKharchaReportRows.mockResolvedValue([row]);
  mocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
  mocks.buildPdfReport.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.downloadBlob.mockReset();
  mocks.sharePdfFile.mockResolvedValue("shared");
});

it("shows expense totals, category and recipient separately from paying account", async () => {
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  expect(await screen.findByText("School fee")).toBeInTheDocument();
  expect(screen.getByText("Cash")).toBeInTheDocument();
  expect(screen.getAllByText("Sana").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Ghar ka kharcha").length).toBeGreaterThan(0);
});

it("supports an exact day and filters the report by recipient", async () => {
  const user = userEvent.setup();
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  await user.click(screen.getByRole("button", { name: "Ek tareekh" }));
  fireEvent.change(screen.getByLabelText("Kharcha report tareekh"), { target: { value: "2026-10-12" } });
  await waitFor(() => expect(mocks.loadKharchaReportSummary).toHaveBeenCalledWith("2026-10-12", "2026-10-12", null));
  await screen.findByRole("option", { name: "Sana" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Raqam lene wala filter" }), "Sana");
  await waitFor(() => expect(mocks.loadKharchaReportRows).toHaveBeenCalledWith("2026-10-12", "2026-10-12", "Sana", 50, 0));
});

it("supports inclusive ranges, monthly, yearly, and complete-history filters", async () => {
  const user = userEvent.setup();
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });

  await user.click(screen.getByRole("button", { name: "Tareekh se tak" }));
  fireEvent.change(screen.getByLabelText("Kharcha report shuru"), { target: { value: "2026-09-30" } });
  fireEvent.change(screen.getByLabelText("Kharcha report aakhir"), { target: { value: "2026-10-03" } });
  await waitFor(() => expect(mocks.loadKharchaReportSummary).toHaveBeenCalledWith("2026-09-30", "2026-10-03", null));

  await user.click(screen.getByRole("button", { name: "Mahina" }));
  fireEvent.change(screen.getByLabelText("Kharcha report maheena"), { target: { value: "2026-09" } });
  await waitFor(() => expect(mocks.loadKharchaReportSummary).toHaveBeenCalledWith("2026-09-01", "2026-09-30", null));

  await user.click(screen.getByRole("button", { name: "Saal" }));
  fireEvent.change(screen.getByLabelText("Kharcha report saal"), { target: { value: "2025" } });
  await waitFor(() => expect(mocks.loadKharchaReportSummary).toHaveBeenCalledWith("2025-01-01", "2025-12-31", null));

  await user.click(screen.getByRole("button", { name: "Sab record" }));
  await waitFor(() => expect(mocks.loadKharchaReportSummary).toHaveBeenCalledWith("2010-01-01", "2026-10-16", null));
});

it("paginates database rows without loading the whole table into the page", async () => {
  const user = userEvent.setup();
  const firstPage = Array.from({ length: 50 }, (_, index) => ({
    ...row, expense_id: `expense-${index}`, description: `Kharcha ${index + 1}`,
  }));
  mocks.loadKharchaReportSummary.mockResolvedValue({ entry_count: 51, total_expenses: 2550, farm_expenses: 0, home_expenses: 2550, personal_expenses: 0 });
  mocks.loadKharchaReportCategories.mockResolvedValue([{ category: "Ghar ka kharcha", expense_type: "home", entry_count: 51, total_amount: 2550 }]);
  mocks.loadKharchaReportRows.mockImplementation((_from: string, _to: string, _recipient: string | null, limit: number, offset: number) =>
    Promise.resolve(offset === 0 ? firstPage : [{ ...row, expense_id: "expense-51", description: "Aakhri kharcha" }].slice(0, limit)));
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  expect(await screen.findByText("Kharcha 1")).toBeInTheDocument();
  expect(screen.getByText("Safha 1 / 2 · 50 kharchay har safhay par")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Agla" }));
  expect(await screen.findByText("Aakhri kharcha")).toBeInTheDocument();
  await waitFor(() => expect(mocks.loadKharchaReportRows).toHaveBeenCalledWith("2026-10-01", "2026-10-16", null, 50, 50));
  expect(screen.getByText("Safha 2 / 2 · 50 kharchay har safhay par")).toBeInTheDocument();
});

it("exports the complete filtered result rather than only the visible page", async () => {
  const user = userEvent.setup();
  const rows = Array.from({ length: 51 }, (_, index) => ({ ...row, expense_id: `expense-${index}`, amount: 100 }));
  mocks.loadKharchaReportSummary.mockResolvedValue({ entry_count: 51, total_expenses: 5100, farm_expenses: 0, home_expenses: 5100, personal_expenses: 0 });
  mocks.loadKharchaReportCategories.mockResolvedValue([{ category: "Ghar ka kharcha", expense_type: "home", entry_count: 51, total_amount: 5100 }]);
  mocks.loadAllKharchaReportRows.mockResolvedValue(rows);
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(mocks.buildPdfReport).toHaveBeenCalledOnce());
  const [, sections, farmName] = mocks.buildPdfReport.mock.calls[0];
  expect(farmName).toBe("Saim Dairy Farm");
  expect(sections[2].rows).toHaveLength(51);
  expect(sections[0].rows).toContainEqual({ item: "Entries ki tadaad", value: 51 });
  expect(mocks.downloadBlob).toHaveBeenCalledWith("kharcha-report-2026-10-01-to-2026-10-16.pdf", expect.any(Blob));
});

it("shares the selected report through the user initiated file-share helper", async () => {
  const user = userEvent.setup();
  mocks.sharePdfFile.mockResolvedValue("downloaded");
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  await user.click(screen.getByRole("button", { name: "PDF share karein" }));
  await waitFor(() => expect(mocks.sharePdfFile).toHaveBeenCalledWith(
    "kharcha-report-2026-10-01-to-2026-10-16.pdf", expect.any(Uint8Array),
    "Saim Dairy Farm Kharcha Report", "2026-10-01 se 2026-10-16 ka kharcha report.",
  ));
  expect(await screen.findByText("File share dastiyab nahi thi; PDF download ho gayi.")).toBeInTheDocument();
});

it("prevents a PDF when rows changed and no longer reconcile with the summary", async () => {
  const user = userEvent.setup();
  mocks.loadAllKharchaReportRows.mockResolvedValue([row, { ...row, expense_id: "expense-2", amount: 12 }]);
  renderWithQuery(<KharchaReport />);
  await screen.findByRole("heading", { name: "2026-10-01 se 2026-10-16 ka khulasa" });
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("entries badal gayin");
  expect(mocks.buildPdfReport).not.toHaveBeenCalled();
});
