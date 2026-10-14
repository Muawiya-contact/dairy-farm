import type { FarmAccount } from "./accounts";
import { monthBounds, type AccountEntry } from "./galla";
import { amount } from "./farm-data";

export function buildAccountLedger(
  entries: AccountEntry[], account: FarmAccount | null, month: string, opening: number,
): (AccountEntry & { running: number })[] {
  const { start, end } = monthBounds(month);
  const rows = [...entries];
  if (account && account.opening_date > start && account.opening_date < end && account.opening_balance !== 0) {
    rows.push({
      entry_date: account.opening_date, entry_kind: "opening", ref_id: account.id,
      description: "Account ka pehla balance",
      money_in: Math.max(account.opening_balance, 0),
      money_out: Math.max(-account.opening_balance, 0),
    });
  }
  rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date)
    || (a.entry_kind === "opening" ? -1 : b.entry_kind === "opening" ? 1 : a.ref_id.localeCompare(b.ref_id)));
  let cents = Math.round(opening * 100);
  return rows.map((entry) => {
    cents += Math.round(amount(entry.money_in) * 100) - Math.round(amount(entry.money_out) * 100);
    return { ...entry, running: cents / 100 };
  });
}
