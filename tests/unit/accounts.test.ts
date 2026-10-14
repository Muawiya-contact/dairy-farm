import { expect, it, vi } from "vitest";
import { updateAccount, validateAccount } from "../../src/lib/accounts";
import { getSupabase } from "../../src/lib/supabase";
import { addDays, todayPK } from "../../src/lib/dates";

vi.mock("../../src/lib/supabase", () => ({ getSupabase: vi.fn() }));

const account = { name: "Bank Alfalah", opening_balance: 100, opening_date: "2026-10-01", active: true };

it("keeps farm cash active and checks account inputs", () => {
  expect(validateAccount(account)).toBeNull();
  expect(validateAccount({ ...account, active: false }, true)).toContain("Farm galla");
  expect(validateAccount({ ...account, name: " " })).toContain("naam");
  expect(validateAccount({ ...account, opening_balance: Number.NaN })).toContain("balance");
  expect(validateAccount({ ...account, opening_balance: 1.234 })).toContain("2 decimal");
  expect(validateAccount({ ...account, opening_balance: 10_000_000_000 })).toContain("10 arab");
  expect(validateAccount({ ...account, opening_balance: -25.5 })).toBeNull();
  expect(validateAccount({ ...account, opening_date: addDays(todayPK(), 1) })).toContain("aaj se aage");
});

it("does not report success when an account disappears during update", async () => {
  const missing = { code: "PGRST116", message: "The result contains 0 rows" };
  const lookup = { select: () => ({ eq: () => ({ single: async () => ({ data: { is_farm_cash: false }, error: null }) }) }) };
  const write = { update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: missing }) }) }) }) };
  vi.mocked(getSupabase).mockReturnValue({ from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(write) } as unknown as ReturnType<typeof getSupabase>);

  await expect(updateAccount("removed-account", account)).rejects.toEqual(missing);
});
