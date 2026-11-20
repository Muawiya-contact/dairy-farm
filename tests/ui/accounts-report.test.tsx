import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { addDays, monthStart, todayPK } from "@/lib/dates";
import { renderWithQuery } from "./utils";
import AccountsReport from "@/components/AccountsReport";

const data = vi.hoisted(() => ({
  bounds: vi.fn(), summary: vi.fn(), rows: vi.fn(), allRows: vi.fn(), settings: vi.fn(),
  pdf: vi.fn(), xlsx: vi.fn(), downloadBlob: vi.fn(), downloadFile: vi.fn(),
}));
vi.mock("@/lib/owner-account-report", async (original) => ({ ...(await original<typeof import("@/lib/owner-account-report")>()),
  getOwnerTransferBounds: data.bounds, getOwnerTransferSummary: data.summary,
  getOwnerTransferRows: data.rows, getAllOwnerTransferRows: data.allRows,
}));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: data.settings }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()),
  buildPdfReport: data.pdf, buildXlsx: data.xlsx, downloadBlob: data.downloadBlob, downloadFile: data.downloadFile,
}));

const withdrawal = { transfer_id: "w-1", transfer_date: todayPK(), direction: "withdrawal", amount: 150,
  owner_account_id: "owner-1", owner_account_name: "Demo Owner", farm_account_id: "cash-1",
  farm_account_name: "Farm galla", note: "Personal use", recorded_by: "12111111-1111-4111-8111-111111111111" };
const deposit = { ...withdrawal, transfer_id: "d-1", direction: "deposit", amount: 75, note: "Cash returned", recorded_by: null };

beforeEach(() => {
  data.bounds.mockResolvedValue({ first_date: "2026-01-01", last_date: todayPK() });
  data.summary.mockResolvedValue({ total_withdrawals: 150, total_deposits: 75, net_amount: -75, withdrawal_count: 1, deposit_count: 1 });
  data.rows.mockResolvedValue([withdrawal, deposit]);
  data.allRows.mockResolvedValue([withdrawal, deposit]);
  data.settings.mockResolvedValue({ farm_name: "Demo Dairy Farm" });
  data.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  data.xlsx.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

it("filters owner deposits and withdrawals by the inclusive selected period", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AccountsReport />);
  expect(await screen.findByRole("link", { name: "Wapas" })).toHaveAttribute("href", "/reports");
  expect((await screen.findAllByText("Rs 75")).length).toBeGreaterThan(0);
  expect(screen.getByText("Personal use")).toBeInTheDocument();
  expect(screen.getByText("Cash returned")).toBeInTheDocument();
  expect(screen.getByText(/User ID: 12111111/)).toBeInTheDocument();
  expect(screen.getByText("Darj nahi")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Aaj" }));
  const today = todayPK();
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(today, today));
  await user.click(screen.getByRole("button", { name: "Sab record" }));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith("2026-01-01", today));

  await user.click(screen.getByRole("button", { name: "Hafta" }));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(addDays(today, -6), today));
  await user.click(screen.getByRole("button", { name: "Maheena" }));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(monthStart(today), today));
  await user.click(screen.getByRole("button", { name: "Saal" }));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(`${today.slice(0, 4)}-01-01`, today));
  await user.click(screen.getByRole("button", { name: "Rozana" }));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(today, today));
  await user.click(screen.getByRole("button", { name: "Apni tareekh" }));
  const startDate = screen.getByLabelText("Accounts Report shuru ki tareekh");
  await user.clear(startDate);
  await user.type(startDate, addDays(today, -3));
  await waitFor(() => expect(data.summary).toHaveBeenLastCalledWith(addDays(today, -3), today));
});

it("downloads PDF, Excel and CSV exports for the selected period", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AccountsReport />);
  await screen.findByText("Cash returned");
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(data.pdf).toHaveBeenCalledWith(expect.stringContaining("Accounts Report"), expect.any(Array), "Demo Dairy Farm"));
  expect(data.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), expect.any(Blob));

  await user.click(screen.getByRole("button", { name: "Excel download" }));
  await waitFor(() => expect(data.xlsx).toHaveBeenCalledWith("Owner transactions", expect.any(Array), expect.any(Array)));
  expect(data.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/\.xlsx$/), expect.any(Blob));

  await user.click(screen.getByRole("button", { name: "CSV download" }));
  await waitFor(() => expect(data.downloadFile).toHaveBeenCalledWith(expect.stringMatching(/\.csv$/), expect.stringContaining("Kul owner deposits"), "text/csv;charset=utf-8"));
});

it("shows an honest empty state and disables forward date ranges", async () => {
  data.summary.mockResolvedValue({ total_withdrawals: 0, total_deposits: 0, net_amount: 0, withdrawal_count: 0, deposit_count: 0 });
  data.rows.mockResolvedValue([]);
  const user = userEvent.setup();
  renderWithQuery(<AccountsReport />);
  expect(await screen.findByText(/Is muddat mein owner transfer nahi mila/)).toBeInTheDocument();
  const endDate = screen.getByLabelText("Accounts Report aakhir ki tareekh");
  await user.clear(endDate);
  await user.type(endDate, addDays(todayPK(), 1));
  expect(await screen.findByRole("alert")).toHaveTextContent(/aaj se aage/);
});
