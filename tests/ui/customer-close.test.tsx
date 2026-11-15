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
  farmMocks.customerMonthReport.mockResolvedValue(null);
  customerMocks.loadCustomerPeriodLedger.mockResolvedValue([]);
  customerMocks.getCustomerPaymentAudit.mockResolvedValue([]);
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    customers: [{ ...fixtures.customer, id: "customer-1", kind: "regular", active: true, opening_date: "2026-01-01", phone: null, free_reason: null, sort_order: 0, is_local: false }],
    balances: [{ customer_id: "customer-1", balance: 500 }], payments: [], companyBills: [], reports: [],
  }), error: null });
});

it("warns about a remaining balance before closing a customer khata", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmCustomers />);
  await user.click(screen.getByRole("button", { name: "Khata band karein" }));
  const dialog = screen.getByRole("dialog", { name: "Khata band karein?" });
  expect(within(dialog).getByText(/Rs 500 abhi lena baqi hai/)).toBeVisible();
  expect(farmMocks.updateCustomerProfile).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Khata band karein" }));
  await waitFor(() => expect(farmMocks.updateCustomerProfile).toHaveBeenCalledWith("customer-1", expect.objectContaining({ active: false })));
});
