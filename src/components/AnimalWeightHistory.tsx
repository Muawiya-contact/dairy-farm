"use client";

import { useState, type FormEvent } from "react";
import { insertRow, longDate, type Animal } from "@/lib/farm-data";
import { animalWeightChange, animalWeightChart, type AnimalWeightHistoryItem, parseAnimalWeight } from "@/lib/animal-weight-history";
import { Panel } from "./ui";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const kg = (value: number) => `${value.toFixed(2)} kg`;

export default function AnimalWeightHistory({ animal, history, today, busy, run }: {
  animal: Animal;
  history: AnimalWeightHistoryItem[];
  today: string;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [validation, setValidation] = useState("");
  const [status, setStatus] = useState("");
  const { latest, previous, change_kg: change } = animalWeightChange(history);
  const chart = animalWeightChart(history);
  const minimumDate = animal.arrival_date ?? animal.birth_date ?? undefined;
  const defaultDate = animal.exit_date ?? today;
  const maximumDate = animal.exit_date ?? today;
  const chartDescription = chart.length
    ? `Aakhri ${chart.length} entries: ${kg(chart[0].weight_kg)} se ${kg(chart.at(-1)!.weight_kg)}.`
    : "Abhi chart ke liye wazan darj nahi.";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const weightDate = String(values.get("weight_date") ?? "");
    let weightKg: number;
    try {
      if (!weightDate || (minimumDate && weightDate < minimumDate) || weightDate > maximumDate) {
        throw new RangeError("Tareekh janwar ke farm par rehne ke dinon ke andar chunein.");
      }
      weightKg = parseAnimalWeight(String(values.get("weight_kg") ?? ""));
    } catch (error) {
      setStatus("");
      setValidation(error instanceof Error ? error.message : "Wazan ki entry dobara dekhein.");
      return;
    }

    setValidation("");
    setStatus("");
    void run(async () => {
      await insertRow("animal_weight_records", {
        animal_id: animal.id,
        weight_date: weightDate,
        weight_kg: weightKg,
        notes: String(values.get("notes") ?? "").trim() || null,
      });
      form.reset();
      setStatus("Wazan ka naya record save ho gaya.");
    });
  };

  return <Panel title="Wazan ki tareekhwar history" className="lg:col-span-2">
    <p className="mb-3 text-sm text-muted">Paidaish ka darj shuda wazan baseline ke taur par dikhta hai. Har naya wazan alag tareekh ke saath save hota hai; purani entries overwrite nahi hotin.</p>
    <form onSubmit={submit} className="print:hidden grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-semibold">Wazan ki tareekh<input name="weight_date" type="date" required min={minimumDate} max={maximumDate} defaultValue={defaultDate} disabled={busy} className={`${field} mt-1`} /></label>
      <label className="text-sm font-semibold">Wazan (kg)<input name="weight_kg" type="number" required min="0.01" max="9999.99" step="0.01" inputMode="decimal" disabled={busy} className={`${field} mt-1`} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Note (optional)<input name="notes" maxLength={500} placeholder="Misal: subah charay se pehle" disabled={busy} className={`${field} mt-1`} /></label>
      {validation && <p role="alert" className="text-sm text-udhaar sm:col-span-2 lg:col-span-3">{validation}</p>}
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Wazan record karein</button>
    </form>
    {status && <p role="status" className="mt-2 text-sm text-berseem-deep">{status}</p>}

    {history.length ? <>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Aakhri wazan</dt><dd className="mt-1 font-semibold">{kg(latest!.weight_kg)}</dd><dd className="text-sm text-muted">{longDate(latest!.weight_date)}</dd></div>
        <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Pichla wazan</dt><dd className="mt-1 font-semibold">{previous ? kg(previous.weight_kg) : "Pichla wazan nahi"}</dd><dd className="text-sm text-muted">{previous ? longDate(previous.weight_date) : "Do entries se pehle ka muqabla nahi"}</dd></div>
        <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Wazan mein farq</dt><dd className="mt-1 font-semibold">{change == null ? "Farq calculate nahi hua" : `${change > 0 ? "+" : ""}${kg(change)}`}</dd><dd className="text-sm text-muted">Aakhri do darj shuda wazan</dd></div>
      </dl>
      <figure className="mt-4 rounded-xl border border-line p-3" role="img" aria-label={`Wazan ka trend. ${chartDescription}`}>
        <figcaption className="mb-2 text-sm font-semibold">Aakhri {chart.length} wazan entries ka trend</figcaption>
        <svg viewBox="0 0 640 220" className="h-48 w-full" aria-hidden="true">
          <line x1="32" y1="32" x2="608" y2="32" stroke="currentColor" opacity="0.15" />
          <line x1="32" y1="188" x2="608" y2="188" stroke="currentColor" opacity="0.15" />
          {chart.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={chart.map((point) => `${point.x},${point.y}`).join(" ")} />}
          {chart.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="5" fill="currentColor"><title>{`${longDate(point.weight_date)} · ${kg(point.weight_kg)}`}</title></circle>)}
        </svg>
        <p className="mt-1 text-xs text-muted">{chartDescription} Yeh darj shuda wazan ka rujhan hai, tashkhees nahi.</p>
      </figure>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Wazan ki tamam tareekhwar entries</caption>
          <thead><tr>{["Tareekh", "Wazan", "Zariya", "Note"].map((heading) => <th key={heading} scope="col" className="border-b border-line px-2 py-2 text-left">{heading}</th>)}</tr></thead>
          <tbody>{[...history].reverse().map((entry) => <tr key={entry.id}>
            <td className="border-b border-line px-2 py-2">{longDate(entry.weight_date)}</td>
            <td className="border-b border-line px-2 py-2 font-semibold">{kg(entry.weight_kg)}</td>
            <td className="border-b border-line px-2 py-2">{entry.source === "birth" ? "Paidaish ka record" : "Farm entry"}</td>
            <td className="border-b border-line px-2 py-2">{entry.notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : <p className="mt-4 rounded-xl bg-ground p-3 text-sm text-muted">Abhi wazan ka record nahi. Wazan history ke liye nayi entry karein.</p>}
    {animal.life_status !== "active" && <p className="mt-3 text-sm text-muted">Janwar farm se ja chuka hai. Purani history mehfooz rahegi; sirf farm se nikalne ki tareekh tak ki entries darj ho sakti hain.</p>}
  </Panel>;
}
