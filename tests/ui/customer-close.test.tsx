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
  farmMocks.recordCustomerPayment.mockResolvedValue(undefined);
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
  customerMocks.loadCustomerPeriodLedger.mockResolvedValueOnce([]).mockResolvedValueOnce([{
    entry_date: fixtures.today, entry_kind: "balance_adjustment", detail: "Purana Khata: App se pehle ka advance",
    litres: null, charge: 0, credit: 0, payment: 0, discount: 0, refund: 0, balance_adjustment: -250,
    running_balance: 250, reference_id: "12345678-1234-4234-8234-123456789099",
  }]);
  customerMocks.loadCustomerPeriodLedgerSummary.mockResolvedValueOnce({ opening_balance: 500, litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, balance_adjustments: 0, closing_balance: 500 })
    .mockResolvedValueOnce({ opening_balance: 500, litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, balance_adjustments: -250, closing_balance: 250 });
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
  expect(await screen.findByText("Naqd · Purana Khata: App se pehle ka advance")).toBeVisible();
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

it("shows a focused dialog when a payment cannot be saved", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789099" });
  farmMocks.recordCustomerPayment.mockRejectedValueOnce(new Error("NetworkError"));
  renderWithQuery(<FarmCustomers />);

  await user.type(screen.getByLabelText("Raqam"), "3500");
  const saveButton = screen.getByRole("button", { name: "Wusooli save karein" });
  const paymentForm = saveButton.closest("form");
  expect(paymentForm).not.toBeNull();
  await user.selectOptions(within(paymentForm!).getByLabelText("Account"), "account-1");
  fireEvent.submit(paymentForm!);

  const dialog = await screen.findByRole("alertdialog", { name: "Save nahi hua" });
  expect(dialog).toHaveTextContent("Internet nahi chal raha. Entry save nahi hui, dobara koshish karein.");
  const closeButton = within(dialog).getByRole("button", { name: "Theek hai" });
  expect(closeButton).toHaveFocus();
  await user.click(closeButton);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("does not call a saved payment a failure when only the refresh fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789099" });
  const { client } = renderWithQuery(<FarmCustomers />);
  vi.spyOn(client, "invalidateQueries").mockRejectedValueOnce(new Error("refresh failed"));

  await user.type(screen.getByLabelText("Raqam"), "3500");
  const saveButton = screen.getByRole("button", { name: "Wusooli save karein" });
  const paymentForm = saveButton.closest("form");
  expect(paymentForm).not.toBeNull();
  await user.selectOptions(within(paymentForm!).getByLabelText("Account"), "account-1");
  fireEvent.submit(paymentForm!);

  expect(await screen.findByText(/Wusooli save ho gayi.*naya hisaab foran load nahi hua/i)).toBeVisible();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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
