import { describe, expect, it } from "vitest";
import { buildAccountLedger } from "../../src/lib/galla-ledger";
import type { FarmAccount } from "../../src/lib/accounts";
import type { AccountEntry } from "../../src/lib/galla";

const account: FarmAccount = {
  id: "account-1", name: "Test bank", kind: "bank", is_farm_cash: false,
  opening_balance: 40, opening_date: "2026-10-15", active: true,
};
const payment: AccountEntry = {
  entry_date: "2026-10-15", entry_kind: "payment", description: "Wusooli",
  money_in: 5, money_out: 0, ref_id: "payment-1",
};

describe("dated opening entries", () => {
  it("puts a mid-month opening before same-day transactions", () => {
    const rows = buildAccountLedger([payment], account, "2026-10", 0);
    expect(rows.map((row) => [row.entry_kind, row.running])).toEqual([
      ["opening", 40], ["payment", 45],
    ]);
  });

  it("shows a negative opening as money out and carries it into later months", () => {
    const debt = { ...account, opening_balance: -25 };
    const first = buildAccountLedger([], debt, "2026-10", 0);
    expect(first.map((row) => [row.money_out, row.running])).toEqual([[25, -25]]);
    expect(buildAccountLedger([], debt, "2026-11", -25)).toEqual([]);
  });

  it("does not duplicate an opening balance on the first day", () => {
    expect(buildAccountLedger([payment], { ...account, opening_date: "2026-10-01" }, "2026-10", 40)
      .map((row) => row.running)).toEqual([45]);
  });
});
