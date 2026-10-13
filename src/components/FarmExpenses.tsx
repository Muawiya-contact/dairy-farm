"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { amount, insertRow, longDate, money, shortDate, useFarmData } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

export default function FarmExpenses() {
  const query = useFarmData();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const run = async (fn: () => Promise<void>, label: string) => {
    setBusy(true); setError(""); setSuccess("");
    try { await fn(); await qc.invalidateQueries({ queryKey: ["farm-data"] }); setSuccess(`${label} Supabase mein save ho gaya.`); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const month = d.today.slice(0,7);
  const pnl = d.monthlyPnl.find((x) => x.month.startsWith(month))?.data;
  const expenses = d.expenses.filter((x) => x.expense_date.startsWith(month)).sort((a,b) => b.expense_date.localeCompare(a.expense_date));
  const categories = d.categories.filter((c) => c.active);
  const accounts = d.accounts.filter((a) => a.active);
  const byCat = categories.map((c) => ({ ...c, total: expenses.filter((e) => e.category_id === c.id).reduce((n,e) => n + amount(e.amount),0) })).filter((c) => c.total > 0).sort((a,b) => b.total - a.total);
  const max = byCat[0]?.total || 1;
  return <><PageHeader title="Kharcha aur munafa" sub={`${longDate(`${month}-01`)} se ${longDate(d.today)}`} />
    <Body className="grid gap-4 lg:grid-cols-2"><section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-paper lg:col-span-2"><div className="p-3 sm:p-4"><p className="text-sm text-muted">Kamai</p><strong className="font-display text-xl">{money(pnl?.total_income)}</strong></div><div className="border-x border-line p-3 sm:p-4"><p className="text-sm text-muted">Farm kharcha</p><strong className="font-display text-xl">{money(pnl?.farm_expenses)}</strong></div><div className="p-3 sm:p-4"><p className="text-sm text-muted">Munafa</p><strong className={`font-display text-xl ${amount(pnl?.profit) < 0 ? "text-udhaar" : "text-berseem"}`}>{money(pnl?.profit)}</strong></div></section>
      <Panel title="Naya kharcha"><form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; void run(async () => { await insertRow("expenses", { expense_date: String(f.get("date")), category_id: String(f.get("category")), account_id: String(f.get("account")), amount: Number(f.get("amount")), note: String(f.get("note")) || null }); form.reset(); }, "Kharcha"); }} className="grid gap-2"><label className="text-sm text-muted">Kharcha ki tareekh<input name="date" type="date" required defaultValue={d.today} className={field} /></label><select name="category" required aria-label="Category" className={field}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="account" required aria-label="Account" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><input name="amount" required type="number" min="0.01" step="0.01" placeholder="Raqam Rs" aria-label="Raqam" className={field} /><input name="note" placeholder="Note (optional)" aria-label="Note" className={field} /><button disabled={busy || !categories.length || !accounts.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Kharcha save karein</button></form>{(!categories.length || !accounts.length) && <p className="mt-2 text-sm text-muted">Pehle category aur account shamil karein.</p>}</Panel>
      <Panel title="Kahan kharcha hua"><ul className="grid gap-3">{byCat.map((c) => <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-2 text-sm"><span className="truncate">{c.name}</span><span className="h-3 overflow-hidden rounded-full bg-ground"><span className="block h-full rounded-full bg-haldi" style={{ width: `${c.total / max * 100}%` }} /></span><strong>{money(c.total)}</strong></li>)}{!byCat.length && <li className="text-muted">Is maah koi kharcha nahi.</li>}</ul></Panel>
      <Panel title="Is maah ke kharche" className="lg:col-span-2"><ul className="divide-y divide-line">{expenses.map((e) => <li key={e.id} className="flex justify-between gap-3 py-2 text-sm"><span className="text-muted">{shortDate(e.expense_date)}</span><span className="min-w-0 flex-1 truncate">{e.note || d.categories.find((c) => c.id === e.category_id)?.name || "Kharcha"}</span><strong>{money(e.amount)}</strong></li>)}</ul></Panel>
      <Panel title="Category aur account setup" className="lg:col-span-2"><div className="grid gap-5 sm:grid-cols-2"><form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; void run(async () => { await insertRow("expense_categories", { name: String(f.get("name")).trim(), is_farm_cost: f.get("farm") === "on" }); form.reset(); }, "Category"); }} className="grid gap-2"><h3 className="font-semibold">Nayi category</h3><input name="name" required placeholder="Category ka naam" aria-label="Category ka naam" className={field} /><label className="text-sm"><input name="farm" type="checkbox" defaultChecked /> Farm kharcha</label><button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-semibold text-berseem">Category save</button></form>
      <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; void run(async () => { await insertRow("accounts", { name: String(f.get("name")).trim(), kind: String(f.get("kind")), is_farm_cash: !d.accounts.some((a) => a.is_farm_cash) }); form.reset(); }, "Account"); }} className="grid gap-2"><h3 className="font-semibold">Naya account</h3><input name="name" required placeholder="Account ka naam" aria-label="Account ka naam" className={field} /><select name="kind" aria-label="Account qism" className={field}><option value="cash">Cash</option>{d.accounts.some((a) => a.is_farm_cash) && <><option value="bank">Bank</option><option value="person">Person</option></>}</select><button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-semibold text-berseem">Account save</button></form></div></Panel>
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}{error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error}</p>}</Body></>;
}
