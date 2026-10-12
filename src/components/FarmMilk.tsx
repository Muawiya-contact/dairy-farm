"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { amount, customerRate, longDate, money, saveMilkEntry, useFarmData, type FarmData } from "@/lib/farm-data";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { MinusIcon, PlusIcon } from "./icons";

type Shift = "morning" | "evening";
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

function ShiftForm({ data, date, shift }: { data: FarmData; date: string; shift: Shift }) {
  const qc = useQueryClient();
  const existing = data.shifts.find((s) => s.milk_date === date && s.shift === shift);
  const active = data.customers.filter((c) => c.active);
  const milkers = data.animals.filter((a) => a.life_status === "active" && a.sex === "female" && a.milking_status === "milking");
  const [mode, setMode] = useState<"total" | "per_animal">(existing?.mode ?? "total");
  const [total, setTotal] = useState(String(existing?.total_litres ?? 0));
  const [perAnimal, setPerAnimal] = useState<Record<string, number>>(() => Object.fromEntries(milkers.map((a) => [a.id, amount(data.animalMilk.find((x) => x.shift_id === existing?.id && x.animal_id === a.id)?.litres)])));
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(active.map((c) => [c.id, amount(data.deliveries.find((x) => x.delivery_date === date && x.shift === shift && x.customer_id === c.id)?.litres ?? (existing ? 0 : shift === "morning" ? c.default_morning : c.default_evening))])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const milkTotal = mode === "total" ? Number(total) || 0 : Object.values(perAnimal).reduce((n, x) => n + x, 0);
  const delivered = Object.values(qty).reduce((n, x) => n + x, 0);
  const remaining = milkTotal - delivered;
  const expectedSale = active.reduce((n, c) => n + (c.kind === "free" || c.kind === "company" ? 0 : (qty[c.id] ?? 0) * customerRate(data, c.id, date)), 0);
  const step = (id: string, change: number, animal = false) => {
    const setter = animal ? setPerAnimal : setQty;
    setter((current) => ({ ...current, [id]: Math.max(0, Math.round(((current[id] ?? 0) + change) * 100) / 100) })); setSaved(false);
  };
  const save = async () => {
    setBusy(true); setError(""); setSaved(false);
    try {
      await saveMilkEntry({ date, shift, total: milkTotal, mode, animals: mode === "per_animal" ? milkers.map((a) => ({ animal_id: a.id, litres: perAnimal[a.id] ?? 0 })) : [], deliveries: active.filter((c) => (qty[c.id] ?? 0) > 0).map((c) => ({ customer_id: c.id, litres: qty[c.id] })) });
      await qc.invalidateQueries({ queryKey: ["farm-data"] }); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
    <div className="grid gap-4"><Panel title="Kitna doodh nikla?"><div className="mb-3 flex gap-2"><button onClick={() => setMode("total")} aria-pressed={mode === "total"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "total" ? "bg-ink text-white" : "bg-ground"}`}>Kul</button><button onClick={() => setMode("per_animal")} aria-pressed={mode === "per_animal"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "per_animal" ? "bg-ink text-white" : "bg-ground"}`}>Har janwar</button></div>
      {mode === "total" ? <label className="flex items-center gap-2"><input aria-label="Kul doodh" type="number" min="0" max="5000" step="0.01" value={total} onChange={(e) => { setTotal(e.target.value); setSaved(false); }} className="w-40 border-b-2 border-berseem bg-transparent font-display text-5xl font-bold outline-none" /><span>litre</span></label> : <ul className="divide-y divide-line">{milkers.map((a) => <li key={a.id} className="flex items-center gap-2 py-2"><strong className="w-16">{a.tag}</strong><span className="min-w-0 flex-1 truncate text-sm text-muted">{a.name || a.breed}</span><button aria-label={`${a.tag} kam`} onClick={() => step(a.id, -0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><span className="w-10 text-center font-bold">{perAnimal[a.id] ?? 0}</span><button aria-label={`${a.tag} zyada`} onClick={() => step(a.id, 0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}<li className="flex justify-between pt-2 font-bold"><span>Kul</span><span>{milkTotal} L</span></li></ul>}
    </Panel><section className="rounded-2xl bg-berseem-deep p-5 text-white"><dl className="grid grid-cols-3 gap-3"><div><dt className="text-sm text-[#cfe3cf]">Nikla</dt><dd className="text-2xl font-bold">{milkTotal} L</dd></div><div><dt className="text-sm text-[#cfe3cf]">Diya</dt><dd className="text-2xl font-bold">{delivered} L</dd></div><div><dt className="text-sm text-[#cfe3cf]">Baqi</dt><dd className="text-2xl font-bold">{remaining} L</dd></div></dl><p className="mt-3 border-t border-white/20 pt-3">Andazi sale: <strong>{money(expectedSale)}</strong></p></section>
    <button onClick={() => void save()} disabled={busy || milkTotal < 0 || remaining < 0} className="min-h-14 rounded-2xl bg-berseem text-lg font-bold text-white disabled:opacity-50">{busy ? "Save ho raha hai…" : "Entry save karein"}</button>{saved && <p role="status" className="text-berseem-deep">Entry Supabase mein save ho gayi.</p>}{error && <p role="alert" className="text-udhaar">Save nahi hua: {error}</p>}</div>
      <Panel title="Customers ko diya"><p className="mb-3 text-sm text-muted">Miqdaar badlein. Bacha hua doodh kisi customer ko khud add karein.</p>{active.some((c) => c.kind === "company") && <button onClick={() => { const company = active.find((c) => c.kind === "company")!; setQty((q) => ({ ...q, [company.id]: Math.max(0, (q[company.id] ?? 0) + remaining) })); setSaved(false); }} disabled={remaining <= 0} className="mb-2 min-h-10 rounded-xl bg-berseem-soft px-3 text-sm font-semibold text-berseem-deep disabled:opacity-50">Baqi collection center ko</button>}<ul className="divide-y divide-line">{active.map((c) => <li key={c.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1"><strong className="block truncate">{c.name}</strong><span className="text-sm text-muted">{c.kind === "free" ? "Muft" : c.kind === "company" ? "Company bill alag" : `${money(customerRate(data, c.id, date))}/L`}</span></span><button aria-label={`${c.name} kam`} onClick={() => step(c.id, -1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${c.name} litres`} type="number" min="0" step="0.01" value={qty[c.id] ?? 0} onChange={(e) => { setQty((q) => ({ ...q, [c.id]: Number(e.target.value) || 0 })); setSaved(false); }} className="w-16 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${c.name} zyada`} onClick={() => step(c.id, 1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}</ul>{!active.length && <p className="text-muted">Pehle Khata mein customer shamil karein.</p>}</Panel>
  </div>;
}

export default function FarmMilk() {
  const query = useFarmData();
  const [date, setDate] = useState("");
  const [shift, setShift] = useState<Shift>("morning");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const chosen = date || d.today;
  return <><PageHeader title="Doodh entry" sub={longDate(chosen)} /><Body><div className="mb-4 grid gap-2 sm:grid-cols-2"><label className="text-sm font-semibold">Tareekh<input type="date" value={chosen} max={d.today} onChange={(e) => setDate(e.target.value)} className={field} /></label><div role="tablist" aria-label="Shift" className="flex gap-1 rounded-xl bg-ground p-1">{(["morning", "evening"] as const).map((s) => <button key={s} role="tab" aria-selected={shift === s} onClick={() => setShift(s)} className={`min-h-11 flex-1 rounded-lg font-bold ${shift === s ? "bg-paper" : "text-muted"}`}>{s === "morning" ? "Subah" : "Shaam"}</button>)}</div></div><ShiftForm key={`${chosen}-${shift}`} data={d} date={chosen} shift={shift} /></Body></>;
}
