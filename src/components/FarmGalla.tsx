"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccounts } from "@/lib/accounts";
import { friendlyError } from "@/lib/errors";
import { amount, money, shortDate } from "@/lib/farm-data";
import { addDays, formatMonth } from "@/lib/dates";
import { getAccountBalanceOn, getAccountEntries, getAccountMonth, getCashCounts,
  getGallaToday, monthBounds, recordCashCount, recordTransfer } from "@/lib/galla";
import { parseCashCount, parseTransfer } from "@/lib/galla-forms";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
type Pending = { id: string; signature: string };

function withRunningBalance(entries: Awaited<ReturnType<typeof getAccountEntries>>, opening: number) {
  let cents = Math.round(opening * 100);
  return entries.map((entry) => {
    cents += Math.round(amount(entry.money_in) * 100) - Math.round(amount(entry.money_out) * 100);
    return { ...entry, running: cents / 100 };
  });
}

export default function FarmGalla() {
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedCountDate, setSelectedCountDate] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const transferPending = useRef<Pending | null>(null);
  const countPending = useRef<Pending | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const meta = useQuery({ queryKey: ["galla", "meta"], queryFn: async () => {
    const [today, accounts] = await Promise.all([getGallaToday(), getAccounts()]);
    return { today, accounts };
  } });
  const today = meta.data?.today ?? "";
  const accounts = meta.data?.accounts ?? [];
  const month = selectedMonth || today.slice(0, 7);
  const accountId = selectedAccountId || accounts.find((account) => account.is_farm_cash)?.id || accounts[0]?.id || "";
  const countDate = selectedCountDate || (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month === today.slice(0, 7) ? today : addDays(monthBounds(month).end, -1)
    : "");
  const activeAccounts = accounts.filter((account) => account.active);
  const selected = accounts.find((account) => account.id === accountId);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7);
  const summary = useQuery({ queryKey: ["galla", "summary", month], queryFn: () => getAccountMonth(month), enabled: validMonth });
  const entries = useQuery({ queryKey: ["galla", "entries", accountId, month], queryFn: () => getAccountEntries(accountId, month), enabled: validMonth && !!accountId });
  const counts = useQuery({ queryKey: ["galla", "counts", accountId, month], queryFn: () => getCashCounts(accountId, month), enabled: validMonth && !!accountId && selected?.kind === "cash" });
  const expected = useQuery({ queryKey: ["galla", "expected", accountId, countDate], queryFn: () => getAccountBalanceOn(accountId, countDate), enabled: !!accountId && selected?.kind === "cash" && /^\d{4}-\d{2}-\d{2}$/.test(countDate) && countDate <= today });
  const current = summary.data?.find((row) => row.account_id === accountId);

  const run = async (action: () => Promise<void>, message: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      await Promise.all([qc.invalidateQueries({ queryKey: ["galla"] }), qc.invalidateQueries({ queryKey: ["farm-data"] })]);
      setSuccess(message); return true;
    } catch (issue) { setError(friendlyError(issue)); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };

  const onTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const input = parseTransfer(new FormData(form), today, accounts);
      const signature = JSON.stringify(input);
      if (transferPending.current?.signature !== signature) transferPending.current = { id: crypto.randomUUID(), signature };
      await recordTransfer(transferPending.current.id, input);
      transferPending.current = null; form.reset(); setSelectedMonth(input.date.slice(0, 7)); setSelectedAccountId(input.from); setSelectedCountDate("");
    }, "Transfer save ho gaya. Dono account ka hisaab update ho gaya.");
  };
  const onCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const input = parseCashCount(new FormData(form), today, accounts);
      const signature = JSON.stringify(input);
      if (countPending.current?.signature !== signature) countPending.current = { id: crypto.randomUUID(), signature };
      await recordCashCount(countPending.current.id, input);
      countPending.current = null; form.reset(); setSelectedMonth(input.date.slice(0, 7)); setSelectedAccountId(input.accountId); setSelectedCountDate("");
    }, "Cash ginti save ho gayi. Ledger ka balance nahi badla.");
  };

  if (!meta.data) return <FarmLoading error={meta.error} retry={() => void meta.refetch()} />;
  const ledger = withRunningBalance(entries.data ?? [], amount(current?.opening));
  const endingBalance = ledger.length ? ledger[ledger.length - 1].running : amount(current?.opening);
  const latestCount = counts.data?.[0];
  return <>
    <PageHeader title="Galla" sub="Account ka paisa, transfer aur cash ginti" />
    <Body className="grid gap-4 lg:grid-cols-2">
      <Panel title="Maheena aur account" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Maheena<input type="month" max={today.slice(0, 7)} value={month} onChange={(event) => { setSelectedMonth(event.target.value); setSelectedCountDate(""); }} className={field} /></label>
          <label className="text-sm font-semibold">Account<select value={accountId} onChange={(event) => setSelectedAccountId(event.target.value)} className={field}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.active ? "" : " (band)"}</option>)}</select></label>
        </div>
        {!validMonth && <p role="alert" className="mt-2 text-udhaar">Aaj tak ka sahi maheena chunein.</p>}
        {!accounts.length && <p className="mt-2 text-muted">Settings mein pehle account banayein.</p>}
      </Panel>
      {summary.isPending && validMonth && <p role="status" className="text-muted lg:col-span-2">Galla load ho raha hai…</p>}
      {summary.isError && <p role="alert" className="text-udhaar lg:col-span-2">Khulasa nahi khula: {friendlyError(summary.error)} <button type="button" onClick={() => void summary.refetch()} className="underline">Dobara koshish</button></p>}
      {validMonth && summary.data && <Panel title="Account ka khulasa" className="lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{summary.data.map((row) => <button key={row.account_id} type="button" onClick={() => setSelectedAccountId(row.account_id)} className={`rounded-xl border p-3 text-left ${row.account_id === accountId ? "border-berseem bg-berseem-soft" : "border-line"}`}>
          <span className="block font-semibold">{row.name}</span><span className="block text-xs text-muted">Shuru {money(row.opening)} · Aaya {money(row.money_in)} · Gaya {money(row.money_out)}</span>
          <strong className={amount(row.closing) < 0 ? "text-udhaar" : "text-berseem-deep"}>Baqi {money(row.closing)}</strong>
        </button>)}</div>
        {!summary.data.length && <p className="text-muted">Is maheene koi account nahi mila.</p>}
        {summary.data.some((row) => amount(row.closing) < 0) && <p role="status" className="mt-3 text-sm text-udhaar">Kisi account ka balance manfi hai. Entry aur opening balance check karein.</p>}
      </Panel>}
      {selected && validMonth && <Panel title={`${selected.name} ka register`} className="lg:col-span-2">
        <p className="mb-2 text-sm text-muted">{formatMonth(monthBounds(month).start)} · Shuru {money(current?.opening)} · Aakhir {money(current?.closing)}</p>
        {entries.isPending && <p role="status">Entries load ho rahi hain…</p>}
        {entries.isError && <p role="alert" className="text-udhaar">Entries nahi khuleen: {friendlyError(entries.error)} <button type="button" onClick={() => void entries.refetch()} className="underline">Dobara koshish</button></p>}
        {entries.data && <ul className="divide-y divide-line">{ledger.map((entry) => <li key={`${entry.entry_kind}-${entry.ref_id}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[5rem_minmax(0,1fr)_7rem_7rem_7rem] sm:items-center"><span className="text-muted">{shortDate(entry.entry_date)}</span><span>{entry.description}</span><span className="text-berseem">{amount(entry.money_in) ? `+ ${money(entry.money_in)}` : ""}</span><span className="text-udhaar">{amount(entry.money_out) ? `− ${money(entry.money_out)}` : ""}</span><strong>Baaki {money(entry.running)}</strong></li>)}{!ledger.length && <li className="py-3 text-muted">Is maheene koi entry nahi.</li>}</ul>}
        {entries.data && current && Math.abs(Math.round(endingBalance * 100) - Math.round(amount(current.closing) * 100)) > 1 && <p role="alert" className="mt-2 text-udhaar">Ledger aur khulasa nahi mil rahe. Page reload karein; phir bhi farq ho to entry check karein.</p>}
      </Panel>}
      <Panel title="Account se account transfer">
        <form onSubmit={onTransfer} className="grid gap-2" key={accountId}>
          <label className="text-sm">Tareekh<input name="date" type="date" max={today} defaultValue={today} required className={field} /></label>
          <label className="text-sm">Kis account se<select name="from" defaultValue={selected?.active ? accountId : ""} required className={field}><option value="" disabled>Account chunein</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Kis account mein<select name="to" defaultValue="" required className={field}><option value="" disabled>Doosra account chunein</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <input name="amount" type="number" min="0.01" step="0.01" required placeholder="Raqam Rs" aria-label="Transfer raqam" className={field} />
          <input name="note" placeholder="Wajah (optional)" aria-label="Transfer note" className={field} />
          <button disabled={busy || activeAccounts.length < 2} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Transfer save karein</button>
        </form>
        {activeAccounts.length < 2 && <p className="mt-2 text-sm text-muted">Transfer ke liye do active accounts chahiye.</p>}
      </Panel>
      <Panel title="Cash ginti aur farq">
        <form onSubmit={onCount} className="grid gap-2">
          <label className="text-sm">Cash account<select name="account" value={selected?.kind === "cash" ? accountId : ""} onChange={(event) => setSelectedAccountId(event.target.value)} required className={field}><option value="" disabled>Cash account chunein</option>{activeAccounts.filter((item) => item.kind === "cash").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Ginti ki tareekh<input name="date" type="date" max={today} value={countDate} onChange={(event) => setSelectedCountDate(event.target.value)} required className={field} /></label>
          <p className="text-sm text-muted">{expected.isPending ? "Hisaab load ho raha hai…" : expected.isError ? `Hisaab nahi mila: ${friendlyError(expected.error)}` : `Hisaab ke mutabiq: ${money(expected.data)}`}</p>
          <input name="amount" type="number" min="0" step="0.01" required placeholder="Gini hui cash Rs (0 bhi likh sakte hain)" aria-label="Gini hui cash" className={field} />
          <input name="reason" placeholder="Farq ho to wajah zaroor likhein" aria-label="Cash farq ki wajah" className={field} />
          <button disabled={busy || !activeAccounts.some((item) => item.kind === "cash") || expected.isPending || expected.isError} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Cash ginti save karein</button>
        </form>
        <p className="mt-2 text-xs text-muted">Ginti sirf tasdeeq hai; is se ledger ka balance nahi badalta. Ghalat ginti ke liye nayi entry likhein.</p>
        {counts.isError && <p role="alert" className="mt-2 text-udhaar">Ginti ki list nahi khuli: {friendlyError(counts.error)} <button type="button" onClick={() => void counts.refetch()} className="underline">Dobara koshish</button></p>}
        {selected?.kind === "cash" && counts.data && <ul className="mt-3 divide-y divide-line text-sm">{counts.data.map((item) => <li key={item.id} className="py-2"><span>{shortDate(item.count_date)} · Gina {money(item.counted_amount)} · Hisaab {money(item.expected_balance)} · Farq <strong className={amount(item.difference) ? "text-udhaar" : "text-berseem"}>{money(item.difference)}</strong></span>{item.reason && <p className="text-muted">{item.reason}</p>}</li>)}{!counts.data.length && <li className="py-2 text-muted">Is maheene koi cash ginti nahi.</li>}</ul>}
        {latestCount?.count_date === countDate && expected.data != null && Math.abs(amount(latestCount.expected_balance) - amount(expected.data)) > 0.009 && <p role="alert" className="mt-2 text-udhaar">Is ginti ke baad purani entry badli hai; nayi ginti karein.</p>}
      </Panel>
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error} Agar connection toot gaya ho to dobara save se pehle register check karein.</p>}
    </Body>
  </>;
}
