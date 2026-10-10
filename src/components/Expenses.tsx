"use client";

import { useMemo, useState } from "react";
import { expenseCategories, expenses as seed, TODAY, type Expense, type ExpenseCategory } from "@/lib/mock-data";
import { CheckIcon } from "./icons";

const rsf = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const label = (k: ExpenseCategory) => expenseCategories.find((c) => c.key === k)!.label;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default function Expenses({ sales }: { sales: number }) {
  const [list, setList] = useState<Expense[]>(seed);
  const [cat, setCat] = useState<ExpenseCategory>("wanda");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const total = list.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(
    () => expenseCategories
      .map((c) => ({ ...c, amount: list.filter((e) => e.category === c.key).reduce((s, e) => s + e.amount, 0) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    [list],
  );
  const max = byCat[0]?.amount ?? 1;
  const profit = sales - total;

  const add = () => {
    const n = Number(amount);
    if (!n) return;
    const e: Expense = { id: `new-${list.length}`, date: TODAY, category: cat, amount: n, note: note.trim() || label(cat) };
    setList((l) => [...l, e]);
    setJustAdded(e.id);
    setAmount(""); setNote("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
      <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-paper lg:col-span-2">
        <div className="min-w-0 p-3 sm:p-4"><p className="text-[14px] text-muted">Sale (Rs)</p><p className="font-display text-[18px] font-bold tnum leading-tight sm:text-[26px]">{sales.toLocaleString("en-IN")}</p></div>
        <div className="min-w-0 border-x border-line p-3 sm:p-4"><p className="text-[14px] text-muted">Kharcha (Rs)</p><p className="font-display text-[18px] font-bold tnum leading-tight sm:text-[26px]">{total.toLocaleString("en-IN")}</p></div>
        <div className={`min-w-0 p-3 sm:p-4 ${profit < 0 ? "bg-udhaar-soft" : "bg-berseem-soft"}`}><p className={`text-[14px] ${profit < 0 ? "text-udhaar" : "text-berseem-deep"}`}>{profit < 0 ? "Nuqsaan" : "Munafa"} (Rs)</p><p className={`font-display text-[18px] font-bold tnum leading-tight sm:text-[26px] ${profit < 0 ? "text-udhaar" : "text-berseem-deep"}`}>{Math.abs(profit).toLocaleString("en-IN")}</p></div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <h2 className="font-display text-[17px] font-bold">Naya kharcha</h2>
        <fieldset className="mt-3">
          <legend className="sr-only">Kis cheez par</legend>
          <div className="grid grid-cols-4 gap-2">
            {expenseCategories.map((c) => (
              <button key={c.key} type="button" onClick={() => setCat(c.key)} aria-pressed={cat === c.key}
                className={`min-h-[46px] rounded-xl border px-1 text-[14px] font-semibold leading-tight ${cat === c.key ? "border-ink bg-ink text-white" : "border-line hover:border-muted"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex gap-2">
          <label className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-3 focus-within:border-berseem">
            <span className="font-semibold text-muted">Rs</span>
            <span className="sr-only">Raqam</span>
            <input value={amount} onChange={(e) => { setAmount(e.target.value.replace(/\D/g, "")); setJustAdded(null); }} inputMode="numeric" placeholder="Raqam" className="w-0 min-w-0 flex-1 bg-transparent text-[18px] font-semibold tnum outline-none" />
          </label>
          <button onClick={add} disabled={!Number(amount)} className="min-h-[52px] min-w-[96px] rounded-xl bg-berseem font-bold text-white hover:bg-berseem-deep disabled:opacity-40">Shamil</button>
        </div>
        <label className="mt-2 block">
          <span className="sr-only">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, jaise: 10 bori wanda" className="min-h-[46px] w-full rounded-xl border border-line px-3 text-[15px] outline-none focus:border-berseem" />
        </label>
        {justAdded && <p role="status" className="mt-3 flex items-center gap-2 text-[15px] text-berseem-deep"><CheckIcon width={18} height={18} />Kharcha shamil ho gaya.</p>}
      </section>

      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <h2 className="font-display text-[17px] font-bold">Kahan kharcha hua</h2>
        <ul className="mt-3 grid gap-3">
          {byCat.map((c) => (
            <li key={c.key} className="grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-[15px]">
              <span>{c.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-ground"><span className="block h-full rounded-full bg-haldi" style={{ width: `${(c.amount / max) * 100}%` }} /></span>
              <span className="text-right font-semibold tnum">{c.amount.toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5 lg:col-span-2">
        <h2 className="font-display text-[17px] font-bold">Is maah ke kharche</h2>
        <ul className="mt-2 divide-y divide-line">
          {[...list].reverse().map((e) => (
            <li key={e.id} className={`flex items-center gap-3 py-3 ${e.id === justAdded ? "bg-haldi-soft -mx-2 rounded-lg px-2" : ""}`}>
              <span className="w-14 shrink-0 text-[14px] font-semibold text-muted tnum">{short(e.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.note}</span>
                <span className="block text-[13px] text-muted">{label(e.category)}</span>
              </span>
              <span className="font-semibold tnum">{rsf(e.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
