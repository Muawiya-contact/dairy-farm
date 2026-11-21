"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyError } from "@/lib/errors";
import { activeAnimalFeedRecords, compatibleFeedUnits, animalFeedPeriodTotals, correctAnimalFeedRecord, loadAnimalFeedOptions, saveAnimalFeedRecord } from "@/lib/animal-feeding";
import type { Animal, AnimalFeedRecord } from "@/lib/farm-data";
import { INVENTORY_UNIT_LABEL, type InventoryUnit } from "@/lib/farm-inventory";
import { longDate } from "@/lib/farm-data";
import { Panel } from "./ui";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const quantityPattern = /^(?:\d+)(?:\.\d{1,6})?$/;
const newRequestId = () => globalThis.crypto.randomUUID();

function readQuantity(value: string): number {
  const normalized = value.trim();
  if (!quantityPattern.test(normalized)) throw new RangeError("Miqdar zero se zyada aur 6 decimal places tak likhein.");
  const quantity = Number(normalized);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError("Miqdar zero se zyada honi chahiye.");
  return quantity;
}

export function AnimalFeeding({ animal, records, today, busy, run }: {
  animal: Animal;
  records: AnimalFeedRecord[];
  today: string;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const optionsQuery = useQuery({
    queryKey: ["animal-feed-options", today],
    queryFn: () => loadAnimalFeedOptions(today),
    staleTime: 30_000,
  });
  const initialDate = animal.exit_date ?? today;
  const [selectedItem, setSelectedItem] = useState("");
  const [rangeFrom, setRangeFrom] = useState(`${today.slice(0, 7)}-01`);
  const [rangeTo, setRangeTo] = useState(today);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("");
  const options = optionsQuery.data ?? [];
  const activeId = selectedItem && options.some((item) => item.id === selectedItem) ? selectedItem : options[0]?.id ?? "";
  const chosen = options.find((item) => item.id === activeId);
  const unitOptions = compatibleFeedUnits(chosen?.base_unit ?? "kg");
  const activeRecords = activeAnimalFeedRecords(records);
  const periodTotals = rangeFrom <= rangeTo ? animalFeedPeriodTotals(records, rangeFrom, rangeTo) : [];
  const dailyRows = activeRecords.filter((entry) => entry.feed_date >= rangeFrom && entry.feed_date <= rangeTo)
    .reduce((groups, entry) => {
      const key = `${entry.feed_date}:${entry.inventory_item_id}:${entry.stock_unit}`;
      const existing = groups.get(key) ?? { date: entry.feed_date, item: entry.item_name, unit: entry.stock_unit, micros: 0, entries: 0 };
      existing.micros += Math.round(Number(entry.stock_quantity) * 1_000_000);
      existing.entries += 1;
      groups.set(key, existing);
      return groups;
    }, new Map<string, { date: string; item: string; unit: string; micros: number; entries: number }>());
  const dailyTotals = [...dailyRows.values()].map((row) => ({ ...row, quantity: row.micros / 1_000_000 }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.item.localeCompare(b.item));

  const submitNew = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const date = String(values.get("feed_date") ?? "");
    const itemId = String(values.get("item_id") ?? "");
    try {
      if (!date || date > initialDate || (animal.arrival_date && date < animal.arrival_date)
          || (!animal.arrival_date && animal.birth_date && date < animal.birth_date)) {
        throw new RangeError("Janwar ke farm par rehne ki muddat ke andar ki tareekh chunein.");
      }
      const quantity = readQuantity(String(values.get("quantity") ?? ""));
      if (!itemId || !options.some((item) => item.id === itemId)) throw new RangeError("Animal feed & fodder list se item chunein.");
      setFormError(""); setStatus("");
      void run(async () => {
        await saveAnimalFeedRecord({ requestId: newRequestId(), animalId: animal.id, itemId, quantity,
          unit: String(values.get("unit")) as InventoryUnit, date, note: String(values.get("note") ?? "").trim() || null });
        form.reset();
        setSelectedItem(options[0]?.id ?? "");
        setStatus("Feed entry save ho gayi; inventory stock aik martaba update hua.");
        await queryClient.invalidateQueries({ queryKey: ["animal-feed-options"] });
      });
    } catch (error) {
      setStatus(""); setFormError(error instanceof Error ? error.message : "Feed entry dobara check karein.");
    }
  };

  const submitCorrection = (event: FormEvent<HTMLFormElement>, original: AnimalFeedRecord) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const itemId = String(values.get("item_id") ?? "");
    try {
      const quantity = readQuantity(String(values.get("quantity") ?? ""));
      if (!itemId || !options.some((item) => item.id === itemId)) throw new RangeError("Dastiyab feed item chunein.");
      setFormError(""); setStatus("");
      void run(async () => {
        await correctAnimalFeedRecord({ requestId: newRequestId(), feedEntryId: original.id, itemId, quantity,
          unit: String(values.get("unit")) as InventoryUnit, note: String(values.get("note") ?? "").trim() || null });
        setCorrectingId(null);
        setStatus("Correction save ho gayi. Purani entry audit ke liye mehfooz hai aur stock aaj durust hua.");
        await queryClient.invalidateQueries({ queryKey: ["animal-feed-options"] });
      });
    } catch (error) {
      setStatus(""); setFormError(error instanceof Error ? error.message : "Correction dobara check karein.");
    }
  };

  const title = "Feed aur charay ka record";
  return <Panel title={title} className="lg:col-span-2">
    <p className="text-sm text-muted">Animal feed &amp; fodder inventory se feed item chunein. Save par stock quantity aik martaba kam hoti hai; doosra Kharcha nahi banta. Feed cost tab tak nahi dikhai jayegi jab tak inventory valuation traceable na ho.</p>
    {animal.life_status !== "active" && <p className="mt-2 text-sm text-muted">Janwar farm se ja chuka hai; sirf us ke farm par rehne ke dinon ki historical feed entry darj ho sakti hai.</p>}
    {optionsQuery.isLoading && <p role="status" className="mt-3 text-sm text-muted">Feed inventory load ho rahi hai…</p>}
    {optionsQuery.error && <p role="alert" className="mt-3 text-sm text-udhaar">Feed inventory load nahi hui: {friendlyError(optionsQuery.error)}</p>}
    {!optionsQuery.isLoading && !optionsQuery.error && options.length === 0 && <p className="mt-3 rounded-xl bg-ground p-3 text-sm">Maujooda feed item nahi mila. Pehle <Link href="/inventory/" className="font-semibold text-berseem underline">Inventory</Link> mein “Animal feed &amp; fodder” category ke andar item aur stock add karein.</p>}

    {options.length > 0 && <form onSubmit={submitNew} className="mt-3 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-4">Nayi feed entry</h3>
      <label className="text-sm font-semibold">Feed item / category<select name="item_id" required value={activeId} onChange={(event) => setSelectedItem(event.target.value)} className={field} disabled={busy}>
        {options.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category_name}</option>)}
      </select>{chosen && <span className="mt-1 block text-xs font-normal text-muted">Maujooda stock: {chosen.current_stock.toLocaleString("en-PK")} {chosen.base_unit}</span>}</label>
      <label className="text-sm font-semibold">Miqdar<input name="quantity" type="number" required min="0.000001" step="0.000001" inputMode="decimal" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Unit<select name="unit" className={field} disabled={busy}>{unitOptions.map((unit) => <option key={unit} value={unit}>{INVENTORY_UNIT_LABEL[unit]}</option>)}</select></label>
      <label className="text-sm font-semibold">Khuraak ki tareekh<input name="feed_date" type="date" required max={initialDate} min={animal.arrival_date ?? animal.birth_date ?? undefined} defaultValue={initialDate} className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold sm:col-span-2 lg:col-span-3">Note (optional)<input name="note" maxLength={1000} placeholder="Feed dene ki wajah ya observation" className={field} disabled={busy} /></label>
      <button type="submit" disabled={busy || optionsQuery.isLoading} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Feed save karein</button>
      {formError && <p role="alert" className="text-sm text-udhaar sm:col-span-2 lg:col-span-4">{formError}</p>}
    </form>}
    {status && <p role="status" className="mt-2 text-sm text-berseem-deep">{status}</p>}

    <section className="mt-4 border-t border-line pt-3" aria-label="Feed quantity summaries">
      <h3 className="font-semibold">Rozana aur muddat ka majmua</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-semibold">Shuru<input type="date" value={rangeFrom} max={today} onChange={(event) => setRangeFrom(event.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-sm font-semibold">Aakhir<input type="date" value={rangeTo} min={rangeFrom} max={today} onChange={(event) => setRangeTo(event.target.value)} className={`${field} mt-1`} /></label>
      </div>
      {rangeFrom > rangeTo && <p role="alert" className="mt-2 text-sm text-udhaar">Shuru ki tareekh aakhir ki tareekh se pehle chunein.</p>}
      {periodTotals.length ? <><h4 className="mt-3 text-sm font-semibold">Muddat ka total</h4><ul className="divide-y divide-line">{periodTotals.map((row) => <li key={`${row.item_id}:${row.unit}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{row.item_name} · {row.entries} entries</span><strong>{row.quantity.toLocaleString("en-PK")} {row.unit}</strong></li>)}</ul></> : <p className="mt-2 text-sm text-muted">Is muddat mein koi current feed entry nahi.</p>}
      {dailyTotals.length > 0 && <><h4 className="mt-3 text-sm font-semibold">Rozana totals</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th scope="col" className="border-b border-line px-2 py-2 text-left">Tareekh</th><th scope="col" className="border-b border-line px-2 py-2 text-left">Feed</th><th scope="col" className="border-b border-line px-2 py-2 text-right">Miqdar</th></tr></thead><tbody>{dailyTotals.slice(0, 40).map((row) => <tr key={`${row.date}:${row.item}:${row.unit}`}><td className="border-b border-line px-2 py-2">{longDate(row.date)}</td><td className="border-b border-line px-2 py-2">{row.item} · {row.entries} entries</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{row.quantity.toLocaleString("en-PK")} {row.unit}</td></tr>)}</tbody></table></div>{dailyTotals.length > 40 && <p className="mt-1 text-xs text-muted">Pehli 40 rozana totals dikhaye gaye hain; Excel dossier mein poori history hai.</p>}</>}
    </section>

    <section className="mt-4 border-t border-line pt-3" aria-label="Feed history">
      <h3 className="font-semibold">Feed history ({records.length})</h3>
      {records.length ? <ul className="mt-2 divide-y divide-line">{records.slice(0, historyLimit).map((entry) => <li key={entry.id} className="py-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{entry.item_name}</strong><p className="text-sm text-muted">{longDate(entry.feed_date)} · {entry.quantity} {INVENTORY_UNIT_LABEL[entry.unit as InventoryUnit] ?? entry.unit}{entry.note ? ` · ${entry.note}` : ""}</p>
          <p className="text-xs text-muted">{entry.superseded_by ? "Purani entry: correction ke baad bhi audit mein mehfooz." : entry.supersedes_id ? "Correction: purani entry ki jagah yeh record current hai." : "Current feed entry."}</p></div>
          {!entry.superseded_by && <button type="button" disabled={busy || !options.length} onClick={() => { setFormError(""); setCorrectingId(correctingId === entry.id ? null : entry.id); }} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">{correctingId === entry.id ? "Band karein" : "Durust karein"}</button>}
        </div>
        {correctingId === entry.id && <form onSubmit={(event) => submitCorrection(event, entry)} className="mt-3 grid gap-2 rounded-xl bg-ground p-3 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-sm text-muted sm:col-span-2 lg:col-span-4">Tareekhi feed din barqarar rahega. Stock mein aaj purani quantity wapas aur corrected quantity jari hogi; dono ledger movements audit mein rahengi.</p>
          <label className="text-sm font-semibold">Feed item<select name="item_id" defaultValue={options.some((item) => item.id === entry.inventory_item_id) ? entry.inventory_item_id : options.find((item) => compatibleFeedUnits(item.base_unit).includes(entry.unit as InventoryUnit))?.id ?? ""} className={field} disabled={busy}>{options.filter((item) => compatibleFeedUnits(item.base_unit).includes(entry.unit as InventoryUnit)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.current_stock} {item.base_unit}</option>)}</select></label>
          <label className="text-sm font-semibold">Corrected miqdar<input name="quantity" type="number" required min="0.000001" step="0.000001" defaultValue={entry.quantity} className={field} disabled={busy} /></label>
          <label className="text-sm font-semibold">Unit<select name="unit" defaultValue={entry.unit} className={field} disabled={busy}>{compatibleFeedUnits(options.find((item) => item.id === entry.inventory_item_id)?.base_unit ?? entry.stock_unit).map((unit) => <option key={unit} value={unit}>{INVENTORY_UNIT_LABEL[unit]}</option>)}</select></label>
          <label className="text-sm font-semibold">Correction note<input name="note" maxLength={1000} defaultValue={entry.note ?? ""} className={field} disabled={busy} /></label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Correction save karein</button>
        </form>}
      </li>)}</ul> : <p className="mt-2 text-sm text-muted">Abhi feed history nahi.</p>}
      {records.length > historyLimit && <button type="button" onClick={() => setHistoryLimit((limit) => limit + 40)} className="mt-2 min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Mazeed {Math.min(40, records.length - historyLimit)} entries dekhein</button>}
    </section>
  </Panel>;
}
