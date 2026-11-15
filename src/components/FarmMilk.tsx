"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refreshFarmViews } from "@/lib/query-refresh";
import { amount, correctMilkEntry, createLocalCustomer, customerRate, localMilkShiftCustomers, longDate, milkShiftAnimals, milkShiftCustomers, money, saveMilkEntry, useFarmData, type FarmData } from "@/lib/farm-data";
import { animalMilkRows, fillCompanyMilk, milkLitres, remainingMilk, sumMilkLitres } from "@/lib/milk-entry";
import { litres } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { MinusIcon, PlusIcon } from "./icons";
import { FarmObservances } from "./FarmObservances";
import { SHIFT_LABELS, noonEnabledOn, visibleShifts, type MilkShiftName } from "@/lib/milk-shifts";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

function ShiftForm({ data, date, shift }: { data: FarmData; date: string; shift: MilkShiftName }) {
  const qc = useQueryClient();
  const existing = data.shifts.find((s) => s.milk_date === date && s.shift === shift);
  const active = milkShiftCustomers(data, date, shift);
  const localCustomers = localMilkShiftCustomers(data, date, shift);
  const visibleCustomers = [...active, ...localCustomers];
  const milkers = milkShiftAnimals(data, existing?.id, date, data.today);
  const [mode, setMode] = useState<"total" | "per_animal">(existing?.mode ?? "total");
  const [total, setTotal] = useState(existing ? String(existing.total_litres) : "");
  const [perAnimal, setPerAnimal] = useState<Record<string, string>>(() => Object.fromEntries(milkers.map((a) => {
    const litres = amount(data.animalMilk.find((x) => x.shift_id === existing?.id && x.animal_id === a.id)?.litres);
    return [a.id, litres ? String(litres) : ""];
  })));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(visibleCustomers.map((c) => {
    const litres = amount(data.deliveries.find((x) => x.delivery_date === date && x.shift === shift && x.customer_id === c.id)?.litres ?? (existing ? 0 : shift === "morning" ? c.default_morning : shift === "noon" ? c.default_noon : c.default_evening));
    return [c.id, litres ? String(litres) : ""];
  })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(existing?.updated_at ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [showLocal, setShowLocal] = useState(false);
  const [localKind, setLocalKind] = useState<"cash" | "free">("cash");
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const localRequest = useRef<{ id: string; signature: string } | null>(null);
  const missingTotal = mode === "total" && total === "";
  const milkTotal = mode === "total" ? sumMilkLitres([Number(total) || 0]) : sumMilkLitres(Object.values(perAnimal).map((x) => Number(x) || 0));
  const delivered = sumMilkLitres(Object.values(qty).map((x) => Number(x) || 0));
  const remaining = remainingMilk(milkTotal, delivered);
  const rateFor = (id: string) => data.deliveries.find((row) => row.delivery_date === date && row.shift === shift && row.customer_id === id)?.rate ?? customerRate(data, id, date);
  const expectedSale = visibleCustomers.reduce((n, c) => n + (c.kind === "free" || c.kind === "company" ? 0 : (Number(qty[c.id]) || 0) * rateFor(c.id)), 0);
  const invalidQuantity = Object.values(qty).some((raw) => {
    if (!raw.trim()) return false;
    try { milkLitres(raw, 3000); return false; }
    catch { return true; }
  });
  const invalidTotal = mode === "total" && !missingTotal && (() => {
    try { milkLitres(total, 5000); return false; }
    catch { return true; }
  })();
  const invalidAnimal = mode === "per_animal" && (milkTotal > 5000 || Object.values(perAnimal).some((raw) => {
    if (!raw.trim()) return false;
    try { milkLitres(raw, 60); return false; }
    catch { return true; }
  }));
  const invalidEntry = invalidQuantity || invalidTotal || invalidAnimal;
  const step = (id: string, change: number, animal = false) => {
    if (animal) setPerAnimal((current) => {
      const next = Math.min(60, Math.max(0, Math.round(((Number(current[id]) || 0) + change) * 100) / 100));
      return { ...current, [id]: next ? String(next) : "" };
    });
    else setQty((current) => {
      const next = Math.min(3000, Math.max(0, Math.round(((Number(current[id]) || 0) + change) * 100) / 100));
      return { ...current, [id]: next ? String(next) : "" };
    });
    setSaved(false);
  };
  const addLocal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (localBusy) return;
    setLocalBusy(true); setLocalError("");
    try {
      const form = new FormData(event.currentTarget);
      const name = String(form.get("localName") ?? "").trim();
      const phone = String(form.get("localPhone") ?? "").trim();
      const rate = Number(form.get("localRate") ?? 0);
      if (!name) throw new RangeError("Local customer ka naam likhein.");
      if (localKind === "cash" && (!Number.isFinite(rate) || rate <= 0 || rate > 99_999_999.99 || Math.round(rate * 100) !== rate * 100)) {
        throw new RangeError("Rate Rs/L 0 se zyada, 2 decimal tak likhein.");
      }
      const input = { name, phone, kind: localKind, rate: localKind === "cash" ? rate : 0, date, freeReason: localKind === "free" ? "charity" as const : null };
      const signature = JSON.stringify(input);
      if (localRequest.current?.signature !== signature) localRequest.current = { id: crypto.randomUUID(), signature };
      await createLocalCustomer(input, localRequest.current.id);
      localRequest.current = null;
      await refreshFarmViews(qc, "milk");
      setShowLocal(false);
    } catch (problem) { setLocalError(friendlyError(problem)); }
    finally { setLocalBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(""); setSaved(false);
    try {
      if (invalidQuantity || invalidTotal || invalidAnimal || missingTotal || remaining < 0 || notes.length > 500) throw new RangeError("Doodh ki har miktar 0 ya zyada, 2 decimal tak likhein; note 500 harf tak rakhein.");
      const deliveries = visibleCustomers.filter((c) => (qty[c.id] ?? "").trim()).map((c) => ({ customer_id: c.id, litres: milkLitres(qty[c.id], 3000) })).filter((row) => row.litres > 0);
      const totalValue = mode === "total" ? milkLitres(total, 5000) : milkTotal;
      const updatedAt = existing
        ? await correctMilkEntry({ date, shift, total: totalValue, mode, animals: mode === "per_animal" ? animalMilkRows(milkers, perAnimal) : [], deliveries, expectedUpdatedAt: version ?? "", notes, reason: correctionReason.trim() })
        : await saveMilkEntry({ date, shift, total: totalValue, mode, animals: mode === "per_animal" ? animalMilkRows(milkers, perAnimal) : [], deliveries, expectedUpdatedAt: version, notes });
      setVersion(updatedAt);
      setSaved(true);
      try { await refreshFarmViews(qc, "milk"); }
      catch { setError("Entry save ho gayi, lekin naye hisaab nahi khulay. Page dobara kholein."); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
    <div className="grid min-w-0 gap-4"><Panel title="Kitna doodh nikla?"><div className="mb-3 flex gap-2"><button onClick={() => setMode("total")} aria-pressed={mode === "total"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "total" ? "bg-ink text-white" : "bg-ground"}`}>Kul</button><button onClick={() => setMode("per_animal")} aria-pressed={mode === "per_animal"} className={`min-h-10 rounded-xl px-4 font-semibold ${mode === "per_animal" ? "bg-ink text-white" : "bg-ground"}`}>Har janwar</button></div>
      {mode === "total" ? <><label className="flex items-center gap-2"><input aria-label="Kul doodh" type="number" min="0" max="5000" step="0.01" placeholder="Litre" value={total} onChange={(e) => { setTotal(e.target.value); setSaved(false); }} className="w-40 border-b-2 border-berseem bg-transparent font-display text-5xl font-bold outline-none" /><span>litre</span></label>{missingTotal && <p className="mt-2 text-sm text-muted">Kul doodh likhein. Agar doodh nahi nikla to 0 likhein.</p>}</> : <ul className="divide-y divide-line">{milkers.map((a) => <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><strong className="min-w-0 max-w-full basis-16 break-all">{a.tag}</strong><span className="min-w-0 flex-1 truncate text-sm text-muted">{a.name || a.breed}</span><button aria-label={`${a.tag} kam`} onClick={() => step(a.id, -0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${a.tag} litres`} type="number" min="0" max="60" step="0.01" placeholder="0 L" value={perAnimal[a.id] ?? ""} onChange={(e) => { setPerAnimal((current) => ({ ...current, [a.id]: e.target.value })); setSaved(false); }} className="w-20 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${a.tag} zyada`} onClick={() => step(a.id, 0.5, true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}<li className="flex justify-between pt-2 font-bold"><span>Kul</span><span>{invalidAnimal ? "—" : litres(milkTotal)}</span></li></ul>}
    </Panel><label className="text-sm font-semibold">Shift ka note (optional)<textarea value={notes} maxLength={500} placeholder="Misal: bacha hua doodh ghar mein istemal hua" onChange={(e) => { setNotes(e.target.value); setSaved(false); }} className={`${field} mt-1 min-h-20 p-3 font-normal`} /></label>{existing && <label className="text-sm font-semibold">Miktar durust karne ki wajah<input aria-label="Miktar durust karne ki wajah" value={correctionReason} maxLength={500} required placeholder="Misal: transfer ke baad 10 L kam nikla" onChange={(event) => { setCorrectionReason(event.target.value); setSaved(false); }} className={`${field} mt-1`} /><span className="mt-1 block text-xs text-muted">Purani aur nayi miktar audit mein mehfooz rahengi.</span></label>}<section className="rounded-2xl bg-berseem-deep p-5 text-white"><dl className="grid grid-cols-3 gap-3"><div><dt className="text-sm text-[#cfe3cf]">Nikla</dt><dd className="text-2xl font-bold">{missingTotal || invalidTotal || invalidAnimal ? "—" : litres(milkTotal)}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Diya</dt><dd className="text-2xl font-bold">{invalidQuantity ? "—" : litres(delivered)}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Baqi</dt><dd className="text-2xl font-bold">{missingTotal || invalidEntry ? "—" : litres(remaining)}</dd></div></dl><p className="mt-3 border-t border-white/20 pt-3">Andazi sale: <strong>{invalidQuantity ? "—" : money(expectedSale)}</strong></p></section>
    <button onClick={() => void save()} disabled={busy || missingTotal || invalidQuantity || invalidTotal || invalidAnimal || milkTotal < 0 || remaining < 0 || !!existing && correctionReason.trim().length < 3} className="min-h-14 rounded-2xl bg-berseem text-lg font-bold text-white disabled:opacity-50">{busy ? "Save ho raha hai…" : existing ? "Durust entry save karein" : "Entry save karein"}</button>{(invalidQuantity || invalidTotal || invalidAnimal) && <p role="alert" className="text-udhaar">Doodh ki miktar 0 ya zyada, 2 decimal tak likhein. Har janwar 60 L tak ho sakta hai.</p>}{existing && correctionReason.trim().length > 0 && correctionReason.trim().length < 3 && <p role="alert" className="text-udhaar">Durust karne ki wajah kam az kam 3 harf mein likhein.</p>}{saved && <p role="status" className="text-berseem-deep">Entry farm ke data mein save ho gayi.</p>}{error && <p role="alert" className="text-udhaar">Save nahi hua: {error}</p>}</div>
      <Panel title="Customers ko diya" className="min-w-0"><p className="mb-3 text-sm text-muted">Khali field ka matlab is customer ko doodh nahi diya. Bacha hua doodh kisi customer ko khud add karein.</p>{active.some((c) => c.kind === "company") && <button onClick={() => { const company = active.find((c) => c.kind === "company")!; setQty((q) => fillCompanyMilk(milkTotal, q, company.id)); setSaved(false); }} disabled={remaining <= 0 || missingTotal || invalidEntry} className="mb-2 min-h-10 rounded-xl bg-berseem-soft px-3 text-sm font-semibold text-berseem-deep disabled:opacity-50">Baqi collection center ko</button>}<ul className="divide-y divide-line">{active.map((c) => <li key={c.id} className="flex min-w-0 flex-wrap items-center justify-end gap-2 py-2 sm:flex-nowrap"><span className="min-w-0 basis-full sm:basis-0 sm:flex-1"><strong className="block truncate">{c.name}</strong><span className="text-sm text-muted">{c.kind === "free" ? "Muft" : c.kind === "company" ? "Company bill alag" : rateFor(c.id) > 0 ? `${money(rateFor(c.id))}/L` : "Rate darj nahi"}</span></span><button aria-label={`${c.name} kam`} onClick={() => step(c.id, -1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${c.name} litres`} type="number" min="0" step="0.01" placeholder="Nahi diya" value={qty[c.id] ?? ""} onChange={(e) => { setQty((q) => ({ ...q, [c.id]: e.target.value })); setSaved(false); }} className="w-24 min-w-0 shrink-0 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${c.name} zyada`} onClick={() => step(c.id, 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}</ul>{!active.length && <p className="text-muted">Pehle Khata mein customer shamil karein.</p>}
        <div className="mt-4 border-t border-line pt-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setShowLocal(!showLocal); setLocalKind("cash"); }} className="min-h-11 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem">Local customer</button><button type="button" onClick={() => { setShowLocal(true); setLocalKind("free"); }} className="min-h-11 rounded-xl bg-berseem-soft px-3 text-sm font-semibold text-berseem-deep">Khairat / Muft doodh</button></div><p className="mt-2 text-xs text-muted">Local buyer ka cash isi delivery ke saath Galla mein darj hota hai. Khairat ki litres record mein rehti hain, lekin us ka paisa, sale aur Khata baqaya zero rehta hai.</p>
          {showLocal && <form onSubmit={addLocal} className="mt-3 grid gap-2 rounded-xl bg-ground p-3"><label className="text-sm font-semibold">{localKind === "free" ? "Khairat ka naam / jagah" : "Local customer ka naam"}<input name="localName" required defaultValue={localKind === "free" ? "Khairat" : ""} placeholder={localKind === "free" ? "Misal: Masjid" : "Misal: Ahmed"} className={`${field} mt-1`} /></label><label className="text-sm font-semibold">Phone (optional)<input name="localPhone" type="tel" placeholder="03xxxxxxxxx" className={`${field} mt-1`} /></label>{localKind === "cash" && <label className="text-sm font-semibold">Rate Rs/L<input name="localRate" type="number" min="0.01" step="0.01" required defaultValue={data.settings.default_milk_rate} className={`${field} mt-1`} /><span className="mt-1 block text-xs font-normal text-muted">Isi naam ka local customer ho to aaj ka rate update hoga. Saved doodh ka rate nahi badlega.</span></label>}<button disabled={localBusy} className="min-h-11 rounded-xl bg-berseem font-semibold text-white disabled:opacity-50">{localBusy ? "Save ho raha hai…" : localKind === "free" ? "Khairat customer shamil karein" : "Local customer shamil karein"}</button>{localError && <p role="alert" className="text-sm text-udhaar">{localError}</p>}</form>}
          {!!localCustomers.length && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Local / khairat customers ({localCustomers.length})</summary><ul className="mt-2 divide-y divide-line">{localCustomers.map((c) => <li key={c.id} className="flex min-w-0 flex-wrap items-center justify-end gap-2 py-2 sm:flex-nowrap"><span className="min-w-0 basis-full sm:basis-0 sm:flex-1"><strong className="block truncate">{c.name}</strong><span className="text-sm text-muted">{c.kind === "free" ? "Khairat / muft" : `${money(rateFor(c.id))}/L · Naqd`}</span></span><button aria-label={`${c.name} kam`} onClick={() => step(c.id, -1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${c.name} litres`} type="number" min="0" step="0.01" placeholder="Nahi diya" value={qty[c.id] ?? ""} onChange={(e) => { setQty((q) => ({ ...q, [c.id]: e.target.value })); setSaved(false); }} className="w-24 min-w-0 shrink-0 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${c.name} zyada`} onClick={() => step(c.id, 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}</ul></details>}
        </div></Panel>
  </div>;
}

export default function FarmMilk() {
  const [date, setDate] = useState("");
  const query = useFarmData("milk", "", date);
  const [shift, setShift] = useState<MilkShiftName>("morning");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const chosen = date || d.today;
  const tabs = visibleShifts(chosen, d.milkShiftConfig, d.shifts);
  const retainedNoon = !noonEnabledOn(chosen, d.milkShiftConfig) && d.shifts.some((s) => s.milk_date === chosen && s.shift === "noon");
  const selected = tabs.includes(shift) ? shift : "morning";
  return <><PageHeader title="Doodh entry" sub={longDate(chosen)} /><Body><div className="mb-4 grid gap-2 sm:grid-cols-2"><label className="text-sm font-semibold">Tareekh<input type="date" value={chosen} max={d.today} onChange={(e) => setDate(e.target.value)} className={field} /></label><div role="tablist" aria-label="Shift" className="flex gap-1 rounded-xl bg-ground p-1">{tabs.map((s) => <button key={s} role="tab" aria-selected={selected === s} onClick={() => setShift(s)} className={`min-h-11 flex-1 rounded-lg font-bold ${selected === s ? "bg-paper" : "text-muted"}`}>{SHIFT_LABELS[s]}{s === "noon" && retainedNoon ? "*" : ""}</button>)}</div>{retainedNoon && <p className="text-sm text-muted sm:col-span-2">* Dopehr band hai. Yeh pehle se darj entry hai; nayi Dopehr entry nahi banegi. Isay durust kar sakte hain.</p>}</div><FarmObservances today={d.today} settings={d.settings} className="mb-4" /><ShiftForm key={`${chosen}-${selected}`} data={d} date={chosen} shift={selected} /></Body></>;
}
