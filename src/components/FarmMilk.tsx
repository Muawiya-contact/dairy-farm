"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { amount, customerRate, longDate, milkShiftAnimals, milkShiftCustomers, money, saveMilkEntry, useFarmData, type FarmData } from "@/lib/farm-data";
import { parseLitres } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { MinusIcon, PlusIcon } from "./icons";

type Shift = "morning" | "evening";
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

function ShiftForm({ data, date, shift }: { data: FarmData; date: string; shift: Shift }) {
  const qc = useQueryClient();
  const existing = data.shifts.find((s) => s.milk_date === date && s.shift === shift);
  const active = milkShiftCustomers(data, date, shift);
  const milkers = milkShiftAnimals(data, existing?.id);
  const [mode, setMode] = useState<"total" | "per_animal">(existing?.mode ?? "total");
  const [total, setTotal] = useState(existing ? String(existing.total_litres) : "");
  const [perAnimal, setPerAnimal] = useState<Record<string, number>>(() => Object.fromEntries(milkers.map((a) => [a.id, amount(data.animalMilk.find((x) => x.shift_id === existing?.id && x.animal_id === a.id)?.litres)])));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(active.map((c) => {
    const litres = amount(data.deliveries.find((x) => x.delivery_date === date && x.shift === shift && x.customer_id === c.id)?.litres ?? (existing ? 0 : shift === "morning" ? c.default_morning : c.default_evening));
    return [c.id, litres ? String(litres) : ""];
  })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const missingTotal = mode === "total" && total === "";
  const milkTotal = mode === "total" ? Number(total) || 0 : Object.values(perAnimal).reduce((n, x) => n + x, 0);
  const delivered = Object.values(qty).reduce((n, x) => n + (Number(x) || 0), 0);
  const remaining = milkTotal - delivered;
  const expectedSale = active.reduce((n, c) => n + (c.kind === "free" || c.kind === "company" ? 0 : (Number(qty[c.id]) || 0) * customerRate(data, c.id, date)), 0);
  const invalidQuantity = Object.values(qty).some((raw) => {
    if (!raw.trim()) return false;
    try { return parseLitres(raw) > 3000; }
    catch { return true; }
  });
  const invalidTotal = mode === "total" && !missingTotal && (() => {
    try { return parseLitres(total) > 5000; }
    catch { return true; }
  })();
  const step = (id: string, change: number, animal = false) => {
    if (animal) setPerAnimal((current) => ({ ...current, [id]: Math.min(60, Math.max(0, Math.round(((current[id] ?? 0) + change) * 100) / 100)) }));
    else setQty((current) => {
      const next = Math.min(3000, Math.max(0, Math.round(((Number(current[id]) || 0) + change) * 100) / 100));
      return { ...current, [id]: next ? String(next) : "" };
    });
    setSaved(false);
  };
  const save = async () => {
    setBusy(true); setError(""); setSaved(false);
    try {
      if (invalidQuantity || invalidTotal || missingTotal) throw new RangeError("Doodh ki har raqam 0 ya zyada, 2 decimal tak likhein.");
      const deliveries = active.filter((c) => (qty[c.id] ?? "").trim()).map((c) => ({ customer_id: c.id, litres: parseLitres(qty[c.id]) })).filter((row) => row.litres > 0);
      await saveMilkEntry({ date, shift, total: mode === "total" ? parseLitres(total) : milkTotal, mode, animals: mode === "per_animal" ? milkers.map((a) => ({ animal_id: a.id, litres: perAnimal[a.id] ?? 0 })) : [], deliveries });
      await qc.invalidateQueries({ queryKey: ["farm-data"] }); setSaved(true);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
    <div className="grid gap-4"><Panel title="Kitna doodh nikla?"><div className="mb-3 flex gap-2"><button onClick={() => setMode("total")} aria-pressed={mode === "total"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "total" ? "bg-ink text-white" : "bg-ground"}`}>Kul</button><button onClick={() => setMode("per_animal")} aria-pressed={mode === "per_animal"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "per_animal" ? "bg-ink text-white" : "bg-ground"}`}>Har janwar</button></div>
      {mode === "total" ? <><label className="flex items-center gap-2"><input aria-label="Kul doodh" type="number" min="0" max="5000" step="0.01" placeholder="Litre" value={total} onChange={(e) => { setTotal(e.target.value); setSaved(false); }} className="w-40 border-b-2 border-berseem bg-transparent font-display text-5xl font-bold outline-none" /><span>litre</span></label>{missingTotal && <p className="mt-2 text-sm text-muted">Kul doodh likhein. Agar doodh nahi nikla to 0 likhein.</p>}</> : <ul className="divide-y divide-line">{milkers.map((a) => <li key={a.id} className="flex items-center gap-2 py-2"><strong className="w-16">{a.tag}</strong><span className="min-w-0 flex-1 truncate text-sm text-muted">{a.name || a.breed}</span><button aria-label={`${a.tag} kam`} onClick={() => step(a.id, -0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><span className="w-10 text-center font-bold">{perAnimal[a.id] ?? 0}</span><button aria-label={`${a.tag} zyada`} onClick={() => step(a.id, 0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}<li className="flex justify-between pt-2 font-bold"><span>Kul</span><span>{milkTotal} L</span></li></ul>}
    </Panel><section className="rounded-2xl bg-berseem-deep p-5 text-white"><dl className="grid grid-cols-3 gap-3"><div><dt className="text-sm text-[#cfe3cf]">Nikla</dt><dd className="text-2xl font-bold">{missingTotal ? "—" : `${milkTotal} L`}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Diya</dt><dd className="text-2xl font-bold">{delivered} L</dd></div><div><dt className="text-sm text-[#cfe3cf]">Baqi</dt><dd className="text-2xl font-bold">{missingTotal ? "—" : `${remaining} L`}</dd></div></dl><p className="mt-3 border-t border-white/20 pt-3">Andazi sale: <strong>{money(expectedSale)}</strong></p></section>
    <button onClick={() => void save()} disabled={busy || missingTotal || invalidQuantity || invalidTotal || milkTotal < 0 || remaining < 0} className="min-h-14 rounded-2xl bg-berseem text-lg font-bold text-white disabled:opacity-50">{busy ? "Save ho raha hai…" : "Entry save karein"}</button>{(invalidQuantity || invalidTotal) && <p role="alert" className="text-udhaar">Doodh ki raqam 0 ya zyada, 2 decimal tak likhein.</p>}{saved && <p role="status" className="text-berseem-deep">Entry Supabase mein save ho gayi.</p>}{error && <p role="alert" className="text-udhaar">Save nahi hua: {error}</p>}</div>
      <Panel title="Customers ko diya"><p className="mb-3 text-sm text-muted">Khali field ka matlab is customer ko doodh nahi diya. Bacha hua doodh kisi customer ko khud add karein.</p>{active.some((c) => c.kind === "company") && <button onClick={() => { const company = active.find((c) => c.kind === "company")!; setQty((q) => ({ ...q, [company.id]: String(Math.max(0, (Number(q[company.id]) || 0) + remaining)) })); setSaved(false); }} disabled={remaining <= 0} className="mb-2 min-h-10 rounded-xl bg-berseem-soft px-3 text-sm font-semibold text-berseem-deep disabled:opacity-50">Baqi collection center ko</button>}<ul className="divide-y divide-line">{active.map((c) => <li key={c.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1"><strong className="block truncate">{c.name}</strong><span className="text-sm text-muted">{c.kind === "free" ? "Muft" : c.kind === "company" ? "Company bill alag" : customerRate(data, c.id, date) > 0 ? `${money(customerRate(data, c.id, date))}/L` : "Rate darj nahi"}</span></span><button aria-label={`${c.name} kam`} onClick={() => step(c.id, -1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${c.name} litres`} type="number" min="0" step="0.01" placeholder="Nahi diya" value={qty[c.id] ?? ""} onChange={(e) => { setQty((q) => ({ ...q, [c.id]: e.target.value })); setSaved(false); }} className="w-24 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${c.name} zyada`} onClick={() => step(c.id, 1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}</ul>{!active.length && <p className="text-muted">Pehle Khata mein customer shamil karein.</p>}</Panel>
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
