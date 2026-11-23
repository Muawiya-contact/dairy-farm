"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshFarmViews } from "@/lib/query-refresh";
import { amount, correctMilkEntry, createLocalCustomer, customerRate, loadMilkDayDistribution, localMilkShiftCustomers, longDate, milkShiftAnimals, milkShiftCustomers, milkShiftLegacyFreeCustomers, money, saveMilkEntry, useFarmData, type FarmData, type MilkDayDistribution } from "@/lib/farm-data";
import { animalMilkRows, fillCompanyMilk, milkLitres, milkShiftOpeningStock, parseMilkDispositions, remainingMilk, sumDispositionLitres, sumMilkLitres, type MilkDispositionDraft, type MilkDispositionType } from "@/lib/milk-entry";
import { litres } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { MinusIcon, PlusIcon } from "./icons";
import { FarmObservances } from "./FarmObservances";
import { FormValidationDialog } from "./FormValidationDialog";
import { SaveErrorDialog } from "./SaveErrorDialog";
import { SHIFT_LABELS, noonEnabledOn, visibleShifts, type MilkShiftName } from "@/lib/milk-shifts";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

const dispositionGroups: Record<MilkDispositionType, { title: string; add: string; categories: [MilkDispositionDraft["category"], string][] }> = {
  free: { title: "Free milk / diya hua", add: "Free milk add karein", categories: [["employee", "Mulazim"], ["friend", "Dost"], ["guest", "Mehman"], ["charity", "Khairat"], ["other", "Dusra recipient"]] },
  internal: { title: "Farm / home use", add: "Istemaal add karein", categories: [["owner_home", "Ghar / khandan"], ["farm_use", "Farm ka istemal"]] },
  wastage: { title: "Wastage / spillage", add: "Waste add karein", categories: [["spillage", "Gir gaya / spill"], ["spoiled", "Kharab hua"], ["other", "Dusri wajah"]] },
};

function DispositionEditor({ type, rows, onAdd, onChange, onRemove }: {
  type: MilkDispositionType; rows: MilkDispositionDraft[]; onAdd: () => void;
  onChange: (key: string, value: Partial<MilkDispositionDraft>) => void; onRemove: (key: string) => void;
}) {
  const group = dispositionGroups[type];
  return <Panel title={group.title} className="min-w-0">
    <p className="mb-3 text-sm text-muted">{type === "free" ? "Muft diya hua doodh recipient ke naam ke saath darj karein." : type === "internal" ? "Ghar aur farm mein istemal ko alag rakhein." : "Har wastage entry ki wajah likhna zaroori hai."}</p>
    <div className="grid gap-3">
      {rows.map((row, index) => <div key={row.key} className="grid gap-2 rounded-xl bg-ground p-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Qism<select aria-label={`${group.title} ${index + 1} qism`} value={row.category} onChange={(event) => onChange(row.key, { category: event.target.value as MilkDispositionDraft["category"] })} className={`${field} mt-1`}>
          {group.categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Litres<input aria-label={`${group.title} ${index + 1} litres`} type="number" min="0" max="5000" step="0.01" inputMode="decimal" value={row.litres} onChange={(event) => onChange(row.key, { litres: event.target.value })} className={`${field} mt-1`} /></label>
        {type === "free" && <label className="text-sm font-semibold sm:col-span-2">Recipient / naam (recipient ya note zaroori)<input aria-label={`${group.title} ${index + 1} recipient`} maxLength={200} value={row.recipient} onChange={(event) => onChange(row.key, { recipient: event.target.value })} placeholder="Misal: Ismail" className={`${field} mt-1`} /></label>}
        <label className="text-sm font-semibold sm:col-span-2">{type === "wastage" ? "Waste ki wajah (zaroori)" : type === "free" ? "Note (naam na ho to zaroori)" : "Note (optional)"}<textarea aria-label={`${group.title} ${index + 1} note`} maxLength={500} rows={2} value={row.note ?? ""} onChange={(event) => onChange(row.key, { note: event.target.value })} placeholder={type === "wastage" ? "Misal: balti gir gayi" : "Mukhtasar tafseel"} className={`${field} mt-1 py-2`} /></label>
        <button type="button" onClick={() => onRemove(row.key)} className="min-h-11 justify-self-start rounded-xl border border-line px-3 text-sm font-semibold">Yeh row hata dein</button>
      </div>)}
      <button type="button" onClick={onAdd} className="min-h-11 justify-self-start rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem">{group.add}</button>
    </div>
  </Panel>;
}

function MilkDaySummary({ date }: { date: string }) {
  const query = useQuery({ queryKey: ["milk-day-distribution", date], queryFn: () => loadMilkDayDistribution(date), staleTime: 15_000 });
  if (query.isPending) return <Panel title="Is din ka doodh taqseem"><p role="status" className="text-sm text-muted">Rozana doodh ka hisaab load ho raha hai…</p></Panel>;
  if (query.isError || !query.data) return <Panel title="Is din ka doodh taqseem"><p role="alert" className="text-sm text-udhaar">Rozana doodh ka hisaab nahi khula: {friendlyError(query.error)} <button type="button" onClick={() => void query.refetch()} className="underline">Dobara koshish</button></p></Panel>;
  const summary: MilkDayDistribution = query.data;
  const rows: [string, string][] = [
    ["Pichla baqi", litres(summary.opening_litres)], ["Aaj production", litres(summary.produced_litres)],
    ["Kul available", litres(summary.available_litres)], ["Khata / credit sale", litres(summary.khata_litres)],
    ["Cash sale", litres(summary.cash_litres)], ["Free / diya hua", litres(summary.free_litres)],
    ["Farm / home use", litres(summary.farm_use_litres)], ["Wastage", litres(summary.wasted_litres)],
    ["Kul allocate hua", litres(summary.allocated_litres)], ["Aakhir baqi", litres(summary.remaining_litres)],
    ["Khata charges", money(summary.khata_amount)], ["Cash sale amount", money(summary.cash_sale_amount)],
    ["Total sales", money(summary.khata_amount + summary.cash_sale_amount)],
    ["Galla mein asal cash", money(summary.cash_received)],
  ];
  const shiftRows = (shift: MilkDayDistribution["shifts"][number]): [string, string][] => [
    ["Chiller se pichla", litres(shift.opening_litres)], ["Kul available", litres(shift.available_litres)],
    ["Nikla", litres(shift.produced_litres)], ["Khata sale", litres(shift.khata_litres)],
    ["Cash sale", litres(shift.cash_litres)], ["Free", litres(shift.free_litres)],
    ["Farm / home", litres(shift.farm_use_litres)], ["Wastage", litres(shift.wasted_litres)],
    ["Allocate hua", litres(shift.allocated_litres)], ["Chiller mein baqi", litres(shift.remaining_litres)],
    ["Khata charges", money(shift.khata_amount)], ["Cash sale", money(shift.cash_sale_amount)],
    ["Galla cash", money(shift.cash_received)],
  ];
  return <Panel title="Is din ka doodh taqseem">
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-xs text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="mb-2 font-bold">Shift ka tafseeli hisaab</h3>
      {summary.shifts.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summary.shifts.map((shift) => <section key={shift.milk_shift} aria-label={`${SHIFT_LABELS[shift.milk_shift]} shift summary`} className="rounded-xl border border-line bg-paper p-3">
        <h4 className="mb-2 font-bold">{SHIFT_LABELS[shift.milk_shift]}</h4>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">{shiftRows(shift).map(([label, value], index) => <div key={`${label}-${index}`}><dt className="text-xs text-muted">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}</dl>
      </section>)}</div> : <p className="text-sm text-muted">Is tareekh par abhi koi shift darj nahi.</p>}
    </div>
    <p className="mt-3 text-xs text-muted">Baqi amount pehle din ka stock aur aaj ki tamam shifts mila kar database se calculate hota hai. Cash sale ki receipt Galla mein sirf aik martaba darj hoti hai.</p>
  </Panel>;
}

function ShiftForm({ data, date, shift }: { data: FarmData; date: string; shift: MilkShiftName }) {
  const qc = useQueryClient();
  const stockQuery = useQuery({ queryKey: ["milk-day-distribution", date], queryFn: () => loadMilkDayDistribution(date), staleTime: 15_000 });
  const existing = data.shifts.find((s) => s.milk_date === date && s.shift === shift);
  const active = milkShiftCustomers(data, date, shift);
  const localCustomers = localMilkShiftCustomers(data, date, shift);
  const legacyFreeCustomers = milkShiftLegacyFreeCustomers(data, date, shift);
  const visibleCustomers = [...active, ...localCustomers, ...legacyFreeCustomers];
  const milkers = milkShiftAnimals(data, existing?.id, date, data.today);
  const [mode, setMode] = useState<"total" | "per_animal">(existing?.mode ?? "total");
  const [total, setTotal] = useState(existing ? String(existing.total_litres) : "");
  const [perAnimal, setPerAnimal] = useState<Record<string, string>>(() => Object.fromEntries(milkers.map((a) => {
    const saved = data.animalMilk.find((x) => x.shift_id === existing?.id && x.animal_id === a.id);
    return [a.id, saved ? String(amount(saved.litres)) : ""];
  })));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(visibleCustomers.map((c) => {
    const litres = amount(data.deliveries.find((x) => x.delivery_date === date && x.shift === shift && x.customer_id === c.id)?.litres ?? (existing ? 0 : shift === "morning" ? c.default_morning : shift === "noon" ? c.default_noon : c.default_evening));
    return [c.id, litres ? String(litres) : ""];
  })));
  const [dispositionRows, setDispositionRows] = useState<MilkDispositionDraft[]>(() => data.dispositions
    .filter((row) => row.shift_id === existing?.id)
    .map((row) => ({ key: row.id, disposition_type: row.disposition_type, category: row.category,
      litres: String(row.litres), recipient: row.recipient ?? "", note: row.note ?? "" })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(existing?.updated_at ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [saveProblems, setSaveProblems] = useState<string[] | null>(null);
  const correctionReasonRef = useRef<HTMLInputElement>(null);
  const [showLocal, setShowLocal] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const localRequest = useRef<{ id: string; signature: string } | null>(null);
  const missingTotal = mode === "total" && total === "";
  const milkTotal = mode === "total" ? sumMilkLitres([Number(total) || 0]) : sumMilkLitres(Object.values(perAnimal).map((x) => Number(x) || 0));
  const delivered = sumMilkLitres(Object.values(qty).map((x) => Number(x) || 0));
  const dispositionResult = (() => {
    try { return { rows: parseMilkDispositions(dispositionRows), error: "" }; }
    catch (e) { return { rows: [], error: e instanceof Error ? e.message : "Disposition dobara check karein." }; }
  })();
  const dispositionTotal = sumDispositionLitres(dispositionResult.rows);
  const allocated = sumMilkLitres([delivered, dispositionTotal]);
  const openingMilk = stockQuery.data ? milkShiftOpeningStock(stockQuery.data.opening_litres, stockQuery.data.shifts, shift) : 0;
  const shiftAvailable = sumMilkLitres([openingMilk, milkTotal]);
  const shiftRemaining = stockQuery.data ? remainingMilk(shiftAvailable, allocated) : 0;
  const savedShift = stockQuery.data?.shifts.find((row) => row.milk_shift === shift);
  const dayAvailable = stockQuery.data
    ? sumMilkLitres([stockQuery.data.available_litres, milkTotal - amount(savedShift?.produced_litres)]) : 0;
  const dayAllocated = stockQuery.data
    ? sumMilkLitres([stockQuery.data.allocated_litres, allocated - amount(savedShift?.allocated_litres)]) : 0;
  const dayRemaining = stockQuery.data ? remainingMilk(dayAvailable, dayAllocated) : 0;
  const companyFillAvailable = sumMilkLitres([allocated, Math.max(0, Math.min(shiftRemaining, dayRemaining))]);
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
  const invalidEntry = invalidQuantity || invalidTotal || invalidAnimal || !!dispositionResult.error;
  const problemsBeforeSave = (): string[] => {
    const problems: string[] = [];
    if (missingTotal) problems.push("Kul doodh likhein. Doodh na nikla ho to 0 likhein.");
    if (invalidTotal) problems.push("Kul doodh 0 se 5,000 L tak, do decimal tak likhein.");
    if (invalidAnimal) problems.push("Har janwar ka doodh 0 se 60 L tak, do decimal tak likhein.");
    if (invalidQuantity) problems.push("Customer ki doodh miktar 0 ya zyada aur do decimal tak likhein.");
    if (dispositionResult.error) problems.push(dispositionResult.error);
    if (stockQuery.isPending) problems.push("Chiller ka pichla balance load hone dein.");
    if (stockQuery.isError || !stockQuery.data) problems.push("Chiller ka balance nahi khula. Dobara koshish karein.");
    if (stockQuery.data && shiftRemaining < 0) problems.push("Is shift ki taqseem chiller ke is waqt available doodh se zyada hai.");
    if (stockQuery.data && shiftRemaining >= 0 && dayRemaining < 0) problems.push("Baad ki saved shifts ya din ke waste ke baad doodh kam par raha hai. Is entry ko kam karein.");
    if (notes.length > 500) problems.push("Shift ka note 500 harf tak rakhein.");
    if (existing && correctionReason.trim().length < 3) problems.push("Miktar durust karne ki wajah kam az kam 3 harf mein likhein.");
    return problems;
  };
  const step = (id: string, change: number, animal = false) => {
    if (animal) setPerAnimal((current) => {
      const next = Math.min(60, Math.max(0, Math.round(((Number(current[id]) || 0) + change) * 100) / 100));
      return { ...current, [id]: next ? String(next) : current[id]?.trim() ? "0" : "" };
    });
    else setQty((current) => {
      const next = Math.min(3000, Math.max(0, Math.round(((Number(current[id]) || 0) + change) * 100) / 100));
      return { ...current, [id]: next ? String(next) : "" };
    });
    setSaved(false);
  };
  const addDisposition = (disposition_type: MilkDispositionType) => {
    const category = disposition_type === "free" ? "charity" : disposition_type === "internal" ? "owner_home" : "spillage";
    setDispositionRows((rows) => [...rows, { key: crypto.randomUUID(), disposition_type, category, litres: "", recipient: "", note: "" }]);
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
      if (!Number.isFinite(rate) || rate <= 0 || rate > 99_999_999.99 || Math.round(rate * 100) !== rate * 100) {
        throw new RangeError("Rate Rs/L 0 se zyada, 2 decimal tak likhein.");
      }
      const input = { name, phone, kind: "cash" as const, rate, date, freeReason: null };
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
      if (!stockQuery.data || invalidQuantity || invalidTotal || invalidAnimal || dispositionResult.error || missingTotal || shiftRemaining < 0 || dayRemaining < 0 || notes.length > 500) throw new RangeError(dispositionResult.error || "Chiller ka baqi balance load hone dein aur doodh ki har miktar dobara check karein.");
      const deliveries = visibleCustomers.filter((c) => (qty[c.id] ?? "").trim()).map((c) => ({ customer_id: c.id, litres: milkLitres(qty[c.id], 3000) })).filter((row) => row.litres > 0);
      const totalValue = mode === "total" ? milkLitres(total, 5000) : milkTotal;
      const updatedAt = existing
        ? await correctMilkEntry({ date, shift, total: totalValue, mode, animals: mode === "per_animal" ? animalMilkRows(milkers, perAnimal) : [], deliveries, dispositions: dispositionResult.rows, expectedUpdatedAt: version ?? "", notes, reason: correctionReason.trim() })
        : await saveMilkEntry({ date, shift, total: totalValue, mode, animals: mode === "per_animal" ? animalMilkRows(milkers, perAnimal) : [], deliveries, dispositions: dispositionResult.rows, expectedUpdatedAt: version, notes });
      setVersion(updatedAt);
      setSaved(true);
      try { await Promise.all([refreshFarmViews(qc, "milk"), qc.invalidateQueries({ queryKey: ["milk-day-distribution", date] }, { throwOnError: true })]); }
      catch { setError("Entry save ho gayi, lekin naye hisaab nahi khulay. Page dobara kholein."); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const requestSave = () => {
    const problems = problemsBeforeSave();
    if (problems.length) { setSaveProblems(problems); return; }
    void save();
  };
  const closeSaveProblems = () => {
    const shouldFocusReason = saveProblems?.some((problem) => problem.startsWith("Miktar durust"));
    setSaveProblems(null);
    if (shouldFocusReason) requestAnimationFrame(() => correctionReasonRef.current?.focus());
  };
  const creditCustomers = active.filter((customer) => customer.kind !== "cash");
  const cashCustomers = [...active.filter((customer) => customer.kind === "cash"), ...localCustomers];
  const company = creditCustomers.find((customer) => customer.kind === "company");
  const updateDisposition = (key: string, value: Partial<MilkDispositionDraft>) => {
    setDispositionRows((rows) => rows.map((row) => row.key === key ? { ...row, ...value } : row));
    setSaved(false);
  };
  const customerRow = (customer: (typeof visibleCustomers)[number]) => <li key={customer.id} className="flex min-w-0 flex-wrap items-center justify-end gap-2 py-2 sm:flex-nowrap">
    <span className="min-w-0 basis-full sm:basis-0 sm:flex-1"><strong className="block truncate">{customer.name}</strong><span className="text-sm text-muted">{customer.kind === "company" ? "Company bill alag" : `${money(rateFor(customer.id))}/L${customer.kind === "cash" ? " · Naqd" : " · Khata"}`}</span></span>
    <button aria-label={`${customer.name} kam`} onClick={() => step(customer.id, -1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><MinusIcon /></button>
    <input aria-label={`${customer.name} litres`} type="number" min="0" step="0.01" placeholder="Nahi diya" value={qty[customer.id] ?? ""} onChange={(event) => { setQty((current) => ({ ...current, [customer.id]: event.target.value })); setSaved(false); }} className="w-24 min-w-0 shrink-0 rounded-lg border border-line bg-paper p-1 text-center font-bold" />
    <button aria-label={`${customer.name} zyada`} onClick={() => step(customer.id, 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"><PlusIcon /></button>
  </li>;
  const dispositionEditor = (type: MilkDispositionType) => <DispositionEditor
    key={type} type={type} rows={dispositionRows.filter((row) => row.disposition_type === type)}
    onAdd={() => addDisposition(type)} onChange={updateDisposition}
    onRemove={(key) => { setDispositionRows((rows) => rows.filter((row) => row.key !== key)); setSaved(false); }}
  />;
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
    <div className="grid min-w-0 gap-4">
      <Panel title="Kitna doodh nikla?"><div className="mb-3 flex gap-2"><button onClick={() => setMode("total")} aria-pressed={mode === "total"} className={`min-h-11 rounded-xl px-4 font-semibold ${mode === "total" ? "bg-ink text-white" : "bg-ground"}`}>Kul</button><button onClick={() => setMode("per_animal")} aria-pressed={mode === "per_animal"} className={`min-h-11 rounded-xl px-4 font-semibold ${mode === "per_animal" ? "bg-ink text-white" : "bg-ground"}`}>Har janwar</button></div>
        {mode === "total" ? <><label className="flex items-center gap-2"><input aria-label="Kul doodh" type="number" min="0" max="5000" step="0.01" placeholder="Litre" value={total} onChange={(event) => { setTotal(event.target.value); setSaved(false); }} className="w-40 border-b-2 border-berseem bg-transparent font-display text-5xl font-bold outline-none" /><span>litre</span></label>{missingTotal && <p className="mt-2 text-sm text-muted">Kul doodh likhein. Agar doodh nahi nikla to 0 likhein.</p>}</> : <ul className="divide-y divide-line">{milkers.map((animal) => <li key={animal.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><strong className="min-w-0 max-w-full basis-16 break-all">{animal.tag}</strong><span className="min-w-0 flex-1 truncate text-sm text-muted">{animal.name || animal.breed}</span><button aria-label={`${animal.tag} kam`} onClick={() => step(animal.id, -0.5, true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line"><MinusIcon /></button><input aria-label={`${animal.tag} litres`} type="number" min="0" max="60" step="0.01" placeholder="0 L" value={perAnimal[animal.id] ?? ""} onChange={(event) => { setPerAnimal((current) => ({ ...current, [animal.id]: event.target.value })); setSaved(false); }} className="w-20 rounded-lg border border-line bg-paper p-1 text-center font-bold" /><button aria-label={`${animal.tag} zyada`} onClick={() => step(animal.id, 0.5, true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line"><PlusIcon /></button></li>)}<li className="flex justify-between pt-2 font-bold"><span>Kul</span><span>{invalidAnimal ? "—" : litres(milkTotal)}</span></li></ul>}
      </Panel>
      <label className="text-sm font-semibold">Shift ka note (optional)<textarea value={notes} maxLength={500} placeholder="Misal: bacha hua doodh ghar mein istemal hua" onChange={(event) => { setNotes(event.target.value); setSaved(false); }} className={`${field} mt-1 min-h-20 p-3 font-normal`} /></label>
      {existing && <label className="text-sm font-semibold">Miktar durust karne ki wajah<input ref={correctionReasonRef} aria-label="Miktar durust karne ki wajah" value={correctionReason} maxLength={500} required placeholder="Misal: transfer ke baad 10 L kam nikla" onChange={(event) => { setCorrectionReason(event.target.value); setSaved(false); }} className={`${field} mt-1`} /><span className="mt-1 block text-xs text-muted">Purani production, sales aur dispositions audit mein mehfooz rahengi.</span></label>}
      <section className="rounded-2xl bg-berseem-deep p-5 text-white"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div><dt className="text-sm text-[#cfe3cf]">Chiller se pichla</dt><dd className="text-xl font-bold">{stockQuery.data ? litres(openingMilk) : "—"}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Aaj nikla</dt><dd className="text-xl font-bold">{missingTotal || invalidTotal || invalidAnimal ? "—" : litres(milkTotal)}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Kul available</dt><dd className="text-xl font-bold">{stockQuery.data && !missingTotal && !invalidTotal && !invalidAnimal ? litres(shiftAvailable) : "—"}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Allocate hua</dt><dd className="text-xl font-bold">{invalidQuantity || dispositionResult.error ? "—" : litres(allocated)}</dd></div><div><dt className="text-sm text-[#cfe3cf]">Aaj ka chiller closing</dt><dd className="text-xl font-bold">{!stockQuery.data || missingTotal || invalidEntry ? "—" : litres(dayRemaining)}</dd></div></dl><p className="mt-3 border-t border-white/20 pt-3">Andazi sale: <strong>{invalidQuantity ? "—" : money(expectedSale)}</strong></p></section>
      {stockQuery.isPending && <p role="status" className="text-sm text-muted">Chiller ka pichla balance load ho raha hai…</p>}
      {stockQuery.isError && <p role="alert" className="text-sm text-udhaar">Chiller ka balance nahi khula: {friendlyError(stockQuery.error)} <button type="button" onClick={() => void stockQuery.refetch()} className="underline">Dobara koshish</button></p>}
      {stockQuery.data && shiftRemaining < 0 && <p role="alert" className="text-sm text-udhaar">Is shift ki taqseem chiller ke is waqt available doodh se zyada hai.</p>}
      {stockQuery.data && shiftRemaining >= 0 && dayRemaining < 0 && <p role="alert" className="text-sm text-udhaar">Baad ki saved shifts ya din ke waste ke baad doodh kam par raha hai. Is entry ko kam karein.</p>}
      <button onClick={requestSave} disabled={busy} className="min-h-14 rounded-2xl bg-berseem text-lg font-bold text-white disabled:opacity-50">{busy ? "Save ho raha hai…" : existing ? "Durust entry save karein" : "Entry save karein"}</button>
      {saved && <p role="status" className="text-berseem-deep">Entry farm ke data mein save ho gayi.</p>}
      {saveProblems && <FormValidationDialog title="Entry pehle check karein" problems={saveProblems} onClose={closeSaveProblems} />}
      {error && <SaveErrorDialog title={saved ? "Entry save hui, magar hisaab nahi khula" : undefined} error={error} onClose={() => setError("")} />}
    </div>
    <div className="grid min-w-0 gap-4">
      <Panel title="Khata / credit sale" className="min-w-0"><p className="mb-2 text-sm text-muted">In deliveries se customer ya company ledger/bill update hota hai; Galla mein cash nahi aata. Chiller ka pichla doodh sirf stock hai, income nahi.</p>{company && <button type="button" onClick={() => { setQty((current) => fillCompanyMilk(companyFillAvailable, current, company.id, dispositionTotal)); setSaved(false); }} disabled={!stockQuery.data || shiftRemaining <= 0 || dayRemaining <= 0 || missingTotal || invalidEntry} className="mb-2 min-h-11 rounded-xl bg-berseem-soft px-3 text-sm font-semibold text-berseem-deep disabled:opacity-50">Baqi company ko dein</button>}<ul className="divide-y divide-line">{creditCustomers.map(customerRow)}</ul>{!creditCustomers.length && <p className="text-sm text-muted">Abhi koi Khata customer nahi.</p>}</Panel>
      <Panel title="Cash sale" className="min-w-0"><p className="mb-2 text-sm text-muted">Saved cash sale ka amount Farm Galla mein aik martaba auto record hota hai.</p><ul className="divide-y divide-line">{cashCustomers.map(customerRow)}</ul>
        <button type="button" onClick={() => setShowLocal((current) => !current)} className="mt-3 min-h-11 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem">Walk-in customer shamil karein</button>
        {showLocal && <form onSubmit={addLocal} className="mt-3 grid gap-2 rounded-xl bg-ground p-3"><label className="text-sm font-semibold">Local customer ka naam<input name="localName" required placeholder="Misal: Ahmed" className={`${field} mt-1`} /></label><label className="text-sm font-semibold">Phone (optional)<input name="localPhone" type="tel" placeholder="03xxxxxxxxx" className={`${field} mt-1`} /></label><label className="text-sm font-semibold">Rate Rs/L<input name="localRate" type="number" min="0.01" step="0.01" required defaultValue={data.settings.default_milk_rate} className={`${field} mt-1`} /><span className="mt-1 block text-xs font-normal text-muted">Naya rate agli delivery par lagu hoga; purani sale ka rate nahi badlega.</span></label><button disabled={localBusy} className="min-h-11 rounded-xl bg-berseem font-semibold text-white disabled:opacity-50">{localBusy ? "Save ho raha hai…" : "Cash customer save karein"}</button>{localError && <p role="alert" className="text-sm text-udhaar">{localError}</p>}</form>}
      </Panel>
      {dispositionEditor("free")}
      {!!legacyFreeCustomers.length && <Panel title="Purane free customer records"><p className="mb-2 text-sm text-muted">Yeh purani Khairat customer entries hain. Naya free milk upar wali category se darj karein.</p><ul className="divide-y divide-line">{legacyFreeCustomers.map(customerRow)}</ul></Panel>}
      {dispositionEditor("internal")}
      {dispositionEditor("wastage")}
    </div>
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
  return <><PageHeader title="Doodh entry" sub={longDate(chosen)} /><Body><div className="mb-4 grid gap-2 sm:grid-cols-2"><label className="text-sm font-semibold">Tareekh<input type="date" value={chosen} max={d.today} onChange={(e) => setDate(e.target.value)} className={field} /></label><div role="tablist" aria-label="Shift" className="flex gap-1 rounded-xl bg-ground p-1">{tabs.map((s) => <button key={s} role="tab" aria-selected={selected === s} onClick={() => setShift(s)} className={`min-h-11 flex-1 rounded-lg font-bold ${selected === s ? "bg-paper" : "text-muted"}`}>{SHIFT_LABELS[s]}{s === "noon" && retainedNoon ? "*" : ""}</button>)}</div>{retainedNoon && <p className="text-sm text-muted sm:col-span-2">* Dopehr band hai. Yeh pehle se darj entry hai; nayi Dopehr entry nahi banegi. Isay durust kar sakte hain.</p>}</div><FarmObservances today={d.today} settings={d.settings} className="mb-4" /><ShiftForm key={`${chosen}-${selected}`} data={d} date={chosen} shift={selected} /><MilkDaySummary date={chosen} /></Body></>;
}
