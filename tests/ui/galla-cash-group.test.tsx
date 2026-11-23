import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import FarmGalla from "@/components/FarmGalla";

const galla = vi.hoisted(() => ({
  getGallaToday: vi.fn(), getAccountMonth: vi.fn(), getAccountEntries: vi.fn(),
  getAutomaticCashPaymentIds: vi.fn(), getCashCounts: vi.fn(), getAccountBalanceOn: vi.fn(),
  getGallaDailyClosing: vi.fn(), recordTransfer: vi.fn(),
}));
vi.mock("@/lib/galla", async (original) => ({ ...(await original<typeof import("@/lib/galla")>()), ...galla }));
vi.mock("@/lib/owner-account-report", async (original) => ({ ...(await original<typeof import("@/lib/owner-account-report")>()),
  getGallaDailyClosing: galla.getGallaDailyClosing,
}));
vi.mock("@/lib/accounts", async (original) => ({ ...(await original<typeof import("@/lib/accounts")>()),
  getAccounts: vi.fn().mockResolvedValue([{ id: "cash-1", name: "Farm galla", kind: "cash", active: true,
    is_farm_cash: true, is_owner: false, opening_date: "2025-01-01", opening_balance: 100 },
  { id: "owner-1", name: "Demo Owner", kind: "person", active: true, is_farm_cash: false,
    is_owner: true, opening_date: "2025-01-01", opening_balance: 0 }]),
}));

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("withdrawal-request-id").mockReturnValueOnce("deposit-request-id") });
  galla.getGallaToday.mockResolvedValue("2026-10-16");
  galla.getAccountMonth.mockResolvedValue([{ account_id: "cash-1", name: "Farm galla", kind: "cash",
    opening: 100, money_in: 55, money_out: 10, closing: 145 }]);
  galla.getAccountEntries.mockResolvedValue([
    { entry_date: "2026-10-16", entry_kind: "payment", description: "Wusooli: Naqd A", money_in: 20, money_out: 0, ref_id: "p1" },
    { entry_date: "2026-10-16", entry_kind: "payment", description: "Wusooli: Naqd B", money_in: 30, money_out: 0, ref_id: "p2" },
    { entry_date: "2026-10-16", entry_kind: "payment", description: "Wusooli: Ali", money_in: 5, money_out: 0, ref_id: "p3" },
    { entry_date: "2026-10-16", entry_kind: "expense", description: "Kharcha: Chara", money_in: 0, money_out: 10, ref_id: "e1" },
  ]);
  galla.getAutomaticCashPaymentIds.mockResolvedValue(["p1", "p2"]);
  galla.getCashCounts.mockResolvedValue([]);
  galla.getAccountBalanceOn.mockResolvedValue(145);
  galla.getGallaDailyClosing.mockResolvedValue({ account_id: "cash-1", account_name: "Farm galla", opening_balance: 100,
    money_received: 55, money_paid: 10, owner_deposits: 0, owner_withdrawals: 0, internal_transfers_in: 0,
    internal_transfers_out: 0, other_transfers_in: 0, other_transfers_out: 0, expected_closing: 145,
    latest_count_id: null, latest_count_date: null, latest_counted_amount: null, latest_count_difference: null,
    latest_count_reason: null, latest_count_is_stale: null });
  galla.recordTransfer.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("records both owner movements through the existing transfer ledger", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmGalla />);
  const ownerHeading = await screen.findByRole("heading", { name: "Owner deposit ya withdrawal" });
  const panel = ownerHeading.closest("section")!;
  expect((await screen.findAllByText("Abhi tak ginti nahi hui")).length).toBeGreaterThan(0);

  await user.selectOptions(within(panel).getByRole("combobox", { name: "Owner account" }), "owner-1");
  await user.type(within(panel).getByRole("spinbutton", { name: "Owner transaction raqam" }), "125");
  await user.type(within(panel).getByRole("textbox", { name: "Owner transaction note" }), "Personal use");
  const ownerForm = panel.querySelector("form") as HTMLFormElement;
  fireEvent.submit(ownerForm);
  await waitFor(() => expect(galla.recordTransfer).toHaveBeenCalledWith("withdrawal-request-id", {
    date: "2026-10-16", from: "cash-1", to: "owner-1", amount: 125, note: "Personal use",
  }));

  await user.click(within(panel).getByRole("radio", { name: "Owner ne farm mein paisay jama karwaye" }));
  await user.selectOptions(within(panel).getByRole("combobox", { name: "Owner account" }), "owner-1");
  await user.type(within(panel).getByRole("spinbutton", { name: "Owner transaction raqam" }), "50");
  await user.type(within(panel).getByRole("textbox", { name: "Owner transaction note" }), "Farm cash wapas");
  fireEvent.submit(panel.querySelector("form")!);
  await waitFor(() => expect(galla.recordTransfer).toHaveBeenCalledWith("deposit-request-id", {
    date: "2026-10-16", from: "owner-1", to: "cash-1", amount: 50, note: "Farm cash wapas",
  }));
});

it("requires a purpose before recording an owner movement", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmGalla />);
  const ownerHeading = await screen.findByRole("heading", { name: "Owner deposit ya withdrawal" });
  const panel = ownerHeading.closest("section")!;
  await user.selectOptions(within(panel).getByRole("combobox", { name: "Owner account" }), "owner-1");
  await user.type(within(panel).getByRole("spinbutton", { name: "Owner transaction raqam" }), "125");
  fireEvent.submit(panel.querySelector("form")!);
  await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("Owner transaction ki wajah likhein."));
  expect(galla.recordTransfer).not.toHaveBeenCalled();
});

it("groups only automatic Naqd receipts and keeps the closing balance", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmGalla />);
  const group = await screen.findByText("Naqd wusooli (2): Rs 50");
  const register = group.closest("ul")!;
  expect(within(register).getByText("Wusooli: Ali")).toBeInTheDocument();
  expect(within(register).getByText("Baaki Rs 145")).toBeInTheDocument();
  await user.click(group);
  expect(within(register).getByText("Wusooli: Naqd A")).toBeVisible();
  expect(within(register).getByText("Wusooli: Naqd B")).toBeVisible();
});
