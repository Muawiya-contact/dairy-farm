"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { amount, insertRow, longDate, money, recordHealthEvent, shortDate, useFarmData, type Animal } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { parseAmount } from "@/lib/format";
import { animalAge, animalLifeEvents, parseAnimalDates, type AnimalSource } from "@/lib/animal-life";
import { Body, PageHeader, Panel, StatusTag } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { PlusIcon, SearchIcon } from "./icons";
import { AnimalManagement } from "./AnimalManagement";
import { AnimalBreeding } from "./AnimalBreeding";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const animalLabel = (a: Animal) => `${a.tag}${a.name ? ` · ${a.name}` : ""}`;

export default function FarmAnimals() {
  const query = useFarmData();
  const qc = useQueryClient();
  const id = useSearchParams().get("id") ?? "";
  const [add, setAdd] = useState(false);
  const [newSource, setNewSource] = useState<AnimalSource>("purchased");
  const [newSex, setNewSex] = useState<Animal["sex"]>("female");
  const [milkLimit, setMilkLimit] = useState(20);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("active");
  const [healthCost, setHealthCost] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const selected = d.animals.find((a) => a.id === id);
  const active = d.animals.filter((a) => a.life_status === "active");
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: ["farm-data"] }); setAdd(false); }
    catch (e) { setError(friendlyError(e)); if (e instanceof Error && /STALE/.test(e.message)) await qc.invalidateQueries({ queryKey: ["farm-data"] }); }
    finally { busyRef.current = false; setBusy(false); }
  };
  if (selected) {
    const status = d.animalStatus.find((x) => x.id === selected.id);
    const history = d.animalMilk.filter((x) => x.animal_id === selected.id).map((x) => ({ ...x, shift: d.shifts.find((s) => s.id === x.shift_id) })).sort((a,b) => (b.shift?.milk_date ?? "").localeCompare(a.shift?.milk_date ?? ""));
    const health = d.health.filter((x) => x.animal_id === selected.id).sort((a,b) => b.event_date.localeCompare(a.event_date));
    const breeding = d.inseminations.filter((x) => x.animal_id === selected.id).sort((a,b) => b.service_date.localeCompare(a.service_date));
    const lifeEvents = animalLifeEvents(selected, d);
    return <><PageHeader title={animalLabel(selected)} sub={`${selected.breed ?? "Nasl darj nahi"} · ${selected.species === "buffalo" ? "Bhains" : "Gaye"}`} back="/janwar/" />
      <Body className="grid gap-4 lg:grid-cols-2"><Panel title="Janwar ki maloomat"><dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Haalat</dt><dd><StatusTag status={selected.life_status !== "active" ? selected.life_status : status?.breeding_status === "pregnant" ? "pregnant" : selected.category === "calf" ? "calf" : selected.milking_status} /></dd></div>
        <div><dt className="text-muted">Paidaish</dt><dd>{selected.birth_date ? longDate(selected.birth_date) : "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Umar</dt><dd>{animalAge(selected, d.today)}</dd></div>
        <div><dt className="text-muted">Farm mein aaya</dt><dd>{selected.arrival_date ? longDate(selected.arrival_date) : "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Aane ka zariya</dt><dd>{{ born: "Farm par paida hua", purchased: "Kharida", gift: "Tohfa", transfer: "Transfer", other: "Doosra" }[selected.source]}</dd></div>
        <div><dt className="text-muted">Kharid qeemat</dt><dd>{selected.purchase_price == null ? "Darj nahi" : money(selected.purchase_price)}</dd></div>
        <div><dt className="text-muted">Agli delivery</dt><dd>{status?.calving_due ? longDate(status.calving_due) : "Darj nahi"}</dd></div>
      </dl>{selected.notes && <p className="mt-3 text-sm text-muted">{selected.notes}</p>}</Panel>
      <AnimalManagement key={selected.id} animal={selected} animals={d.animals} accounts={d.accounts} today={d.today} />
      <Panel title="Farm mein zindagi ka record" className="lg:col-span-2">{!selected.arrival_date && <p className="mb-2 text-sm text-muted">Is purane janwar ki aane ki tareekh darj nahi. Maloom ho to record mein likhein.</p>}{lifeEvents.length ? <ol className="divide-y divide-line">{lifeEvents.map((event) => <li key={event.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[8rem_9rem_1fr]"><time className="text-muted">{longDate(event.date)}</time><strong>{event.title}</strong><span>{event.detail}</span></li>)}</ol> : <p className="text-sm text-muted">Abhi zindagi ka koi tareekhwar record nahi.</p>}</Panel>
      <Panel title={`Doodh ka record (${history.length})`}>{history.length ? <><ul className="divide-y divide-line">{history.slice(0, milkLimit).map((x) => <li key={x.id} className="flex justify-between py-2 text-sm"><span>{x.shift ? shortDate(x.shift.milk_date) : ""} · {x.shift?.shift === "morning" ? "Subah" : "Shaam"}</span><strong>{amount(x.litres)} L</strong></li>)}</ul>{history.length > milkLimit && <button type="button" onClick={() => setMilkLimit((count) => count + 50)} className="mt-2 min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Mazeed {Math.min(50, history.length - milkLimit)} entries dekhein</button>}</> : <p className="text-sm text-muted">Abhi per-janwar doodh entry nahi.</p>}</Panel>
      <Panel title="Sehat">{selected.life_status === "active" && <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; void run(async () => { const cost = String(f.get("cost") ?? "").trim() ? parseAmount(String(f.get("cost"))) : 0; await recordHealthEvent({ animalId: selected.id, date: String(f.get("date")), kind: String(f.get("kind")), title: String(f.get("title")), cost, nextDueDate: String(f.get("next")) || null, categoryId: cost > 0 ? String(f.get("category")) : null, accountId: cost > 0 ? String(f.get("account")) : null }); form.reset(); setHealthCost(0); }); }} className="grid gap-2 sm:grid-cols-2">
        <input name="title" required placeholder="Ilaj ya vaccine" aria-label="Ilaj ya vaccine" className={field} /><label className="text-sm text-muted">Sehat entry ki tareekh<input name="date" type="date" required defaultValue={d.today} className={field} /></label>
        <select name="kind" aria-label="Qism" className={field}><option value="treatment">Ilaj</option><option value="vaccine">Vaccine</option><option value="deworming">Deworming</option><option value="checkup">Checkup</option><option value="other">Doosra</option></select><input name="cost" type="number" min="0" step="0.01" placeholder="Kharcha Rs" aria-label="Kharcha" className={field} onChange={(e) => setHealthCost(Number(e.target.value) || 0)} />
        {healthCost > 0 && <><select name="category" required aria-label="Kharcha category" defaultValue={d.categories.find((c) => c.name === "Dawai / vet" && c.active)?.id} className={field}>{d.categories.filter((c) => c.active && c.is_farm_cost).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="account" required aria-label="Kharcha account" className={field}>{d.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></>}
        <label className="text-sm text-muted">Agli tareekh<input name="next" type="date" className={field} /></label><button disabled={busy || (healthCost > 0 && (!d.categories.some((c) => c.active && c.is_farm_cost) || !d.accounts.some((a) => a.active)))} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Sehat entry save</button>
      </form>}<ul className="mt-4 divide-y divide-line">{health.map((x) => <li key={x.id} className="py-2 text-sm"><strong>{x.title}</strong> · {shortDate(x.event_date)}{amount(x.cost) > 0 ? ` · ${money(x.cost)}` : ""}{x.next_due_date ? ` · Agla: ${shortDate(x.next_due_date)}` : ""}</li>)}</ul></Panel>
      <AnimalBreeding animal={selected} records={breeding} calvings={d.calvings.filter((x) => x.animal_id === selected.id)} today={d.today} busy={busy} run={run} />
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error}</p>}</Body></>;
  }
  const list = d.animals.filter((a) => (filter === "all" || a.life_status === filter || a.species === filter || a.milking_status === filter) && `${a.tag} ${a.name ?? ""} ${a.breed ?? ""}`.toLowerCase().includes(term.toLowerCase()));
  return <><PageHeader title="Janwar" sub={`${active.length} active, ${active.filter((a) => a.milking_status === "milking").length} doodh de rahe`} action={<button onClick={() => setAdd(!add)} className="flex min-h-11 items-center gap-1 rounded-xl bg-berseem px-4 font-semibold text-white"><PlusIcon width={18} />Naya</button>} />
    <Body>{add && <Panel title="Naya janwar"><form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { const dates = parseAnimalDates({ source: newSource, arrival: String(f.get("arrival") ?? ""), birth: String(f.get("birth") ?? ""), estimatedYears: String(f.get("ageYears") ?? ""), estimatedMonths: String(f.get("ageMonths") ?? ""), purchaseDate: String(f.get("purchaseDate") ?? ""), today: d.today }); await insertRow("animals", { tag: String(f.get("tag") ?? "").trim(), name: String(f.get("name") || "").trim() || null, species: String(f.get("species")), breed: String(f.get("breed") || "").trim() || null, sex: newSex, category: String(f.get("category")), milking_status: newSex === "male" ? "none" : String(f.get("milking")), source: newSource, ...dates, purchase_price: newSource === "purchased" && String(f.get("purchasePrice") || "").trim() ? parseAmount(String(f.get("purchasePrice"))) : null, notes: String(f.get("notes") || "").trim() || null }); }); }} className="grid gap-3 sm:grid-cols-2">
      <input name="tag" required placeholder="Tag number" aria-label="Tag number" className={field} /><input name="name" placeholder="Naam (optional)" aria-label="Naam" className={field} /><input name="breed" placeholder="Nasl" aria-label="Nasl" className={field} />
      <select name="species" aria-label="Species" className={field}><option value="cow">Gaye</option><option value="buffalo">Bhains</option></select><select name="sex" aria-label="Sex" value={newSex} onChange={(e) => setNewSex(e.target.value as Animal["sex"])} className={field}><option value="female">Female</option><option value="male">Male</option></select><select name="category" aria-label="Category" className={field}><option value="cow">Bari</option><option value="heifer">Heifer</option><option value="calf">Bacha</option><option value="bull">Bull</option></select>
      <select name="milking" aria-label="Milk status" disabled={newSex === "male"} className={field}><option value="none">Doodh nahi</option><option value="milking">Doodh de rahi</option><option value="dry">Khushk</option></select>
      <label className="grid gap-1 text-sm text-muted">Aane ka zariya<select name="source" value={newSource} onChange={(e) => setNewSource(e.target.value as AnimalSource)} className={field}><option value="purchased">Kharida</option><option value="born">Farm par paida hua</option><option value="gift">Tohfa</option><option value="transfer">Transfer</option><option value="other">Doosra</option></select></label>
      <label className="grid gap-1 text-sm text-muted">Paidaish ki tareekh {newSource === "born" ? "(zaroori)" : "(agar maloom ho)"}<input name="birth" type="date" max={d.today} required={newSource === "born"} className={field} /></label>
      {newSource !== "born" && <><label className="grid gap-1 text-sm text-muted">Farm mein aane ki tareekh<input name="arrival" type="date" max={d.today} required className={field} /></label><div className="grid gap-2 sm:col-span-2"><p className="text-sm text-muted">Paidaish maloom nahi? Aane ke waqt ki taqreebi umar optional likhein.</p><div className="grid grid-cols-2 gap-2"><input name="ageYears" type="number" min="0" max="50" step="1" aria-label="Taqreebi umar saal" placeholder="Saal" className={field} /><input name="ageMonths" type="number" min="0" max="11" step="1" aria-label="Taqreebi umar maheene" placeholder="Maheene" className={field} /></div></div></>}
      {newSource === "purchased" && <><label className="grid gap-1 text-sm text-muted">Kharid ki tareekh (optional)<input name="purchaseDate" type="date" max={d.today} className={field} /></label><input name="purchasePrice" type="number" min="0" step="0.01" aria-label="Kharid qeemat" placeholder="Kharid qeemat Rs (optional)" className={field} /></>}
      <textarea name="notes" aria-label="Janwar ke notes" placeholder="Janwar ke notes (optional)" className={`${field} min-h-24 py-2 sm:col-span-2`} />
      <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Janwar save karein</button></form></Panel>}
    <label className="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-line bg-paper px-3"><SearchIcon className="text-muted" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tag ya nasal" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
    <div className="my-3 flex gap-2 overflow-x-auto">{[["active","Active"],["all","Sab"],["cow","Gayein"],["buffalo","Bhainsein"],["milking","Doodh"],["dry","Khushk"],["sold","Farokht"],["dead","Wafat"],["removed","Doosre niklay"]].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === value ? "border-ink bg-ink text-white" : "border-line bg-paper"}`}>{label}</button>)}</div>
    <ul className="overflow-hidden rounded-2xl border border-line bg-paper lg:grid lg:grid-cols-2">{list.map((a) => <li key={a.id} className="border-b border-line"><Link href={`/janwar/?id=${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ground"><span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-berseem font-display font-bold">{a.tag}</span><span className="min-w-0 flex-1"><strong className="block truncate">{a.name || a.breed || a.tag}</strong><span className="text-sm text-muted">{a.species === "buffalo" ? "Bhains" : "Gaye"} · {a.breed ?? "Nasl nahi"}</span></span><StatusTag status={a.life_status !== "active" ? a.life_status : a.category === "calf" ? "calf" : a.milking_status} /></Link></li>)}{list.length === 0 && <li className="p-6 text-muted">Koi janwar nahi mila.</li>}</ul>
    {error && <p role="alert" className="mt-3 text-udhaar">Save nahi hua: {error}</p>}</Body></>;
}
