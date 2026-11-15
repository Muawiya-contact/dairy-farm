import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { farmMocks, fixtures, makeFarmData, renderWithQuery } from "./utils";
import FarmCustomers from "@/components/FarmCustomers";

const customerMocks = vi.hoisted(() => ({ loadCustomerPeriodLedger: vi.fn(), getCustomerPaymentAudit: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("id=customer-1") }));
vi.mock("@/lib/reporting", async (original) => ({ ...(await original<typeof import("@/lib/reporting")>()), loadCustomerPeriodLedger: customerMocks.loadCustomerPeriodLedger }));
vi.mock("@/lib/galla", async (original) => ({ ...(await original<typeof import("@/lib/galla")>()), getCustomerPaymentAudit: customerMocks.getCustomerPaymentAudit }));

beforeEach(() => {
  farmMocks.updateCustomerProfile.mockResolvedValue(undefined);
  farmMocks.finalizeCustomerKhata.mockResolvedValue(undefined);
  farmMocks.getCustomerClosureHistory.mockResolvedValue([]);
  farmMocks.customerMonthReport.mockResolvedValue(null);
  customerMocks.loadCustomerPeriodLedger.mockResolvedValue([]);
  customerMocks.getCustomerPaymentAudit.mockResolvedValue([]);
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    customers: [{ ...fixtures.customer, id: "customer-1", kind: "regular", active: true, opening_date: "2026-01-01", phone: null, free_reason: null, sort_order: 0, is_local: false }],
    balances: [{ customer_id: "customer-1", balance: 500 }], payments: [], companyBills: [], reports: [],
  }), error: null });
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
