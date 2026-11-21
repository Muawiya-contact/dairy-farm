import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import { addDays, todayPK } from "@/lib/dates";

const mocks = vi.hoisted(() => ({
  loadFinalReport: vi.fn(), finalReportExportSections: vi.fn(), buildPdfReport: vi.fn(),
  buildXlsx: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));

vi.mock("@/lib/final-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/final-report")>()),
  loadFinalReport: mocks.loadFinalReport,
  finalReportExportSections: mocks.finalReportExportSections,
}));
vi.mock("@/lib/export-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export-data")>()),
  buildPdfReport: mocks.buildPdfReport, buildXlsx: mocks.buildXlsx, downloadBlob: mocks.downloadBlob,
}));
vi.mock("@/lib/pdf-share", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf-share")>()), sharePdfFile: mocks.sharePdfFile,
}));

import FinalReport from "@/components/FinalReport";

const reportData = {
  financial: {
    period: {
      farmName: "Test Dairy",
      summary: { produced: 70, delivered: 60, sold_litres: 60, free_litres: 2, milk_income: 1800,
        cash_collected: 900, other_income: 100, farm_expenses: 500, home_expenses: 50, profit: 1400 },
      customers: [{ customer_id: "customer-1", name: "Ali", kind: "regular", sort_order: 1,
        litres: 40, charged: 1200, paid: 500, discount: 0, refund: 0, period_balance_change: 700 }],
      expenses: [{ expense_date: "2026-11-10", category: "Feed", is_farm_cost: true, account: "Farm cash", amount: 500, note: null }],
    },
    customers: [{ customer_id: "customer-1", name: "Ali", kind: "regular", active: true, sort_order: 1,
      litres: 40, charges: 1200, payments: 500, discounts: 0, refunds: 0, opening_balance: 0, opening_added: 0, closing_balance: 700 }],
    accounts: [{ account_id: "cash-1", account_name: "Farm cash", account_kind: "cash", opening_balance: 400,
      money_received: 900, money_paid: 300, transfers_in: 0, transfers_out: 0, closing_balance: 1000,
      opening_date: "2026-11-01", opening_amount: 400 }],
    salaryPayables: [], otherIncome: [], trends: [],
  },
  milk: {
    daily: [{ report_date: "2026-11-10", opening_litres: 5, produced_litres: 20, available_litres: 25,
      khata_litres: 12, cash_litres: 5, free_litres: 1, farm_use_litres: 2, wasted_litres: 1,
      allocated_litres: 21, remaining_litres: 4, khata_delivery_amount: 300, company_bill_amount: 0,
      khata_amount: 300, cash_sale_amount: 250, total_sales_amount: 550, cash_received: 250, galla_cash_received: 250,
      free_details: [], farm_use_details: [], waste_details: [] }],
    shifts: [{ report_date: "2026-11-10", milk_shift: "morning", produced_litres: 20, khata_litres: 12,
      cash_litres: 5, free_litres: 1, farm_use_litres: 2, wasted_litres: 1, allocated_litres: 21,
      remaining_litres: 4, khata_delivery_amount: 300, cash_sale_amount: 250, cash_received: 250,
      galla_cash_received: 250, free_details: [], farm_use_details: [], waste_details: [] }],
    totals: { opening_litres: 5, produced_litres: 20, available_litres: 25, khata_litres: 12,
      cash_litres: 5, free_litres: 1, farm_use_litres: 2, wasted_litres: 1, allocated_litres: 21,
      closing_litres: 4, khata_delivery_amount: 300, company_bill_amount: 0, khata_amount: 300,
      cash_sale_amount: 250, total_sales_amount: 550, cash_received: 250, galla_cash_received: 250,
      outstanding_khata_amount: 700 },
  },
  ownerTransfers: { total_withdrawals: 100, total_deposits: 200, net_amount: 100, withdrawal_count: 1, deposit_count: 2 },
  khata: [
    { is_grand_total: false, customer_id: "customer-1", name: "Ali", sort_order: 1, litres: 40,
      opening_balance: 0, opening_added: 0, charges: 1200, total_payable: 1200, payments: 500,
      discounts: 0, refunds: 0, closing_balance: 700, receivables_due: 700, customer_credits: 0 },
    { is_grand_total: true, customer_id: null, name: "Grand total", sort_order: 2147483647, litres: 40,
      opening_balance: 0, opening_added: 0, charges: 1200, total_payable: 1200, payments: 500,
      discounts: 0, refunds: 0, closing_balance: 700, receivables_due: 700, customer_credits: 0 },
  ],
  cashPosition: { closing_cash_bank_balance: 1000, cash_bank_account_count: 1 },
  expenses: [{ category: "Feed", is_farm_cost: true, entries: 1, amount: 500 }],
};

beforeEach(() => {
  mocks.loadFinalReport.mockReset().mockResolvedValue(reportData);
  mocks.finalReportExportSections.mockReset().mockReturnValue([{ title: "Final", columns: ["item"], rows: [{ item: "milk" }] }]);
  mocks.buildPdfReport.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.buildXlsx.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.downloadBlob.mockReset();
  mocks.sharePdfFile.mockReset().mockResolvedValue("downloaded");
});

it("combines saved milk, Khata, expense, profit, and account balances", async () => {
  renderWithQuery(<FinalReport />);
  expect(await screen.findByRole("heading", { name: "Farm ki performance" })).toBeInTheDocument();
  expect(screen.getByText("Kul doodh paidawar").closest("div")).toHaveTextContent("20 L");
  expect(screen.getByText("Local / cash milk sales", { selector: "dt" }).closest("div")).toHaveTextContent("Rs 250");
  expect(screen.getByText("Customer se lena baqi").closest("div")).toHaveTextContent("Rs 700");
  expect(screen.getByText("Cash / bank closing").closest("div")).toHaveTextContent("Rs 1,000");
  expect(screen.getByRole("link", { name: /Milk Report kholein/ })).toHaveAttribute("href", "/reports/milk");
  expect(screen.getByText(/Chuni hui muddat ka doodh balance mil raha hai/)).toBeInTheDocument();
});

it("uses the prior month, custom dates, and rejects a future range", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FinalReport />);
  await screen.findByRole("heading", { name: "Farm ki performance" });
  const monthStart = `${todayPK().slice(0, 7)}-01`;
  const previousDay = addDays(monthStart, -1);
  const previousMonthStart = `${previousDay.slice(0, 7)}-01`;
  await user.click(screen.getByRole("button", { name: "Pichla maheena" }));
  await waitFor(() => expect(mocks.loadFinalReport).toHaveBeenLastCalledWith(previousMonthStart, previousDay));

  const endDate = screen.getByLabelText("Final Report aakhri tareekh");
  fireEvent.change(endDate, { target: { value: addDays(todayPK(), 1) } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aaj tak ki sahi muddat");
  expect(mocks.loadFinalReport).toHaveBeenCalledTimes(2);
});

it("exports the selected consolidated report and gives a download fallback when sharing is unavailable", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FinalReport />);
  await screen.findByRole("heading", { name: "Farm ki performance" });
  await user.click(screen.getByRole("button", { name: "Excel download" }));
  await waitFor(() => expect(mocks.buildXlsx).toHaveBeenCalledOnce());
  expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/^final-farm-report-.*\.xlsx$/), expect.any(Blob));

  await user.click(screen.getByRole("button", { name: "PDF share karein" }));
  await waitFor(() => expect(mocks.sharePdfFile).toHaveBeenCalledOnce());
  expect(await screen.findByText("Is device par PDF share nahi ho saki; file download ho gayi.")).toBeInTheDocument();
});
