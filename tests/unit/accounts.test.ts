import { expect, it } from "vitest";
import { validateAccount } from "../../src/lib/accounts";

const account = { name: "Bank Alfalah", opening_balance: 100, opening_date: "2026-10-01", active: true };

it("keeps farm cash active and checks account inputs", () => {
  expect(validateAccount(account)).toBeNull();
  expect(validateAccount({ ...account, active: false }, true)).toContain("Farm galla");
  expect(validateAccount({ ...account, name: " " })).toContain("naam");
  expect(validateAccount({ ...account, opening_balance: Number.NaN })).toContain("balance");
});
