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

export type DisplayLedgerRow = {
  key: string; entry_date: string; description: string; money_in: number; money_out: number;
  running: number; children?: (AccountEntry & { running: number })[];
};

/** Group delivery-linked receipts by day, then recalculate displayed running balances. */
export function groupAutomaticCashReceipts(
  ledger: ReturnType<typeof buildAccountLedger>, paymentIds: ReadonlySet<string>, opening: number,
): DisplayLedgerRow[] {
  const days = new Map<string, typeof ledger>();
  for (const row of ledger) days.set(row.entry_date, [...(days.get(row.entry_date) ?? []), row]);
  const display: DisplayLedgerRow[] = [];
  let cents = Math.round(opening * 100);
  for (const [date, rows] of days) {
    const auto = rows.filter((row) => row.entry_kind === "payment" && paymentIds.has(row.ref_id));
    const others = rows.filter((row) => row.entry_kind !== "payment" || !paymentIds.has(row.ref_id));
    const openingRows = others.filter((row) => row.entry_kind === "opening");
    const rest = others.filter((row) => row.entry_kind !== "opening");
    const grouped: DisplayLedgerRow[] = auto.length ? [{
      key: `naqd-${date}`, entry_date: date, description: `Naqd wusooli (${auto.length})`,
      money_in: auto.reduce((sum, row) => sum + Math.round(amount(row.money_in) * 100), 0) / 100,
      money_out: 0, running: 0, children: auto,
    }] : [];
    for (const row of [...openingRows, ...grouped, ...rest]) {
      cents += Math.round(amount(row.money_in) * 100) - Math.round(amount(row.money_out) * 100);
      display.push({ ...row, key: "key" in row ? String(row.key) : `${row.entry_kind}-${row.ref_id}`, running: cents / 100 });
    }
  }
  return display;
}
