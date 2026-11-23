import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { farmMocks, fixtures, makeFarmData, renderWithQuery } from "./utils";
import FarmCustomers from "@/components/FarmCustomers";

const customerMocks = vi.hoisted(() => ({ loadCustomerPeriodLedger: vi.fn(), loadCustomerPeriodLedgerSummary: vi.fn(), getCustomerPaymentAudit: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("id=customer-1") }));
vi.mock("@/lib/reporting", async (original) => ({ ...(await original<typeof import("@/lib/reporting")>()), loadCustomerPeriodLedger: customerMocks.loadCustomerPeriodLedger, loadCustomerPeriodLedgerSummary: customerMocks.loadCustomerPeriodLedgerSummary }));
vi.mock("@/lib/galla", async (original) => ({ ...(await original<typeof import("@/lib/galla")>()), getCustomerPaymentAudit: customerMocks.getCustomerPaymentAudit }));

beforeEach(() => {
  farmMocks.updateCustomerProfile.mockResolvedValue(undefined);
  farmMocks.finalizeCustomerKhata.mockResolvedValue(undefined);
  farmMocks.recordCustomerBalanceAdjustment.mockResolvedValue(undefined);
  farmMocks.getCustomerClosureHistory.mockResolvedValue([]);
  farmMocks.customerMonthReport.mockResolvedValue(null);
  customerMocks.loadCustomerPeriodLedger.mockResolvedValue([]);
  customerMocks.loadCustomerPeriodLedgerSummary.mockResolvedValue({ opening_balance: 0, litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, balance_adjustments: 0, closing_balance: 0 });
  customerMocks.getCustomerPaymentAudit.mockResolvedValue([]);
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    customers: [{ ...fixtures.customer, id: "customer-1", kind: "regular", active: true, opening_date: "2026-01-01", phone: null, free_reason: null, sort_order: 0, is_local: false }],
    balances: [{ customer_id: "customer-1", balance: 500 }], payments: [], companyBills: [], reports: [],
  }), error: null });
});
afterEach(() => vi.unstubAllGlobals());

it("lets a customer khata add a dated prior advance without calling it a payment", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789099" });
  renderWithQuery(<FarmCustomers />);
  await waitFor(() => {
    expect(customerMocks.loadCustomerPeriodLedger).toHaveBeenCalledTimes(1);
    expect(customerMocks.loadCustomerPeriodLedgerSummary).toHaveBeenCalledTimes(1);
  });
  await user.click(screen.getByRole("button", { name: "Purana baqaya ya advance add karein" }));
  await user.selectOptions(screen.getByLabelText("Kis taraf ka purana hisaab?"), "advance");
  await user.type(screen.getByLabelText("Raqam (Rs)"), "250");
  await user.type(screen.getByLabelText("Wajah / tafseel"), "App se pehle ka advance");
  fireEvent.submit(screen.getByRole("button", { name: "Purana Khata save karein" }).closest("form")!);
  await waitFor(() => expect(farmMocks.recordCustomerBalanceAdjustment).toHaveBeenCalled());
  await waitFor(() => expect(farmMocks.recordCustomerBalanceAdjustment).toHaveBeenCalledWith(
    "customer-1",
    { date: fixtures.today, balanceChange: -250, reason: "App se pehle ka advance" },
    expect.any(String),
  ));
  await waitFor(() => {
    expect(customerMocks.loadCustomerPeriodLedger).toHaveBeenCalledTimes(2);
    expect(customerMocks.loadCustomerPeriodLedgerSummary).toHaveBeenCalledTimes(2);
  });
});

it("offers the prior-balance option for cash customers too", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    customers: [{ ...fixtures.customer, id: "customer-1", kind: "cash", active: true, opening_date: "2026-01-01", phone: null, free_reason: null, sort_order: 0, is_local: false }],
    balances: [{ customer_id: "customer-1", balance: 0 }], payments: [], companyBills: [], reports: [],
  }), error: null });
  renderWithQuery(<FarmCustomers />);
  expect(screen.getByRole("button", { name: "Purana baqaya ya advance add karein" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Wusooli save karein" })).toBeVisible();
});

it("records the exact remaining balance through a confirmed final settlement before closing a customer khata", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmCustomers />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Aakhri account" }), "account-1");
  await user.type(screen.getByPlaceholderText(/Misal: customer/), "Final payment received");
  await user.click(screen.getByRole("button", { name: /Aakhri hisaab check/ }));
  const dialog = screen.getByRole("dialog", { name: /Aakhri hisaab ke saath/ });
  expect(within(dialog).getByText(/Rs 500 ki wusooli record/)).toBeVisible();
  expect(farmMocks.updateCustomerProfile).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: /Aakhri hisaab save/ }));
  await waitFor(() => expect(farmMocks.finalizeCustomerKhata).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer-1", action: "payment", accountId: "account-1" })));
});
