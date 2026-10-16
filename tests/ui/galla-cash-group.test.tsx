import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import FarmGalla from "@/components/FarmGalla";

const galla = vi.hoisted(() => ({
  getGallaToday: vi.fn(), getAccountMonth: vi.fn(), getAccountEntries: vi.fn(),
  getAutomaticCashPaymentIds: vi.fn(), getCashCounts: vi.fn(), getAccountBalanceOn: vi.fn(),
}));
vi.mock("@/lib/galla", async (original) => ({ ...(await original<typeof import("@/lib/galla")>()), ...galla }));
vi.mock("@/lib/accounts", async (original) => ({ ...(await original<typeof import("@/lib/accounts")>()),
  getAccounts: vi.fn().mockResolvedValue([{ id: "cash-1", name: "Farm galla", kind: "cash", active: true,
    is_farm_cash: true, opening_date: "2025-01-01", opening_balance: 100 }]),
}));

beforeEach(() => {
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
