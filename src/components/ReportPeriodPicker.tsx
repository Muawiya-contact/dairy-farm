"use client";

import { addDays, monthStart } from "@/lib/dates";

export type ReportPeriodPreset = "today" | "day" | "week" | "month" | "year" | "all" | "custom";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const labels: Record<ReportPeriodPreset, string> = {
  today: "Aaj", day: "Rozana", week: "Hafta", month: "Maheena", year: "Saal", all: "Sab record", custom: "Apni tareekh",
};

export default function ReportPeriodPicker({
  label, today, allFrom, from, to, preset, onRange, onPreset,
}: {
  label: string; today: string; allFrom: string; from: string; to: string; preset: ReportPeriodPreset;
  onRange: (from: string, to: string) => void; onPreset: (preset: ReportPeriodPreset) => void;
}) {
  const choose = (value: ReportPeriodPreset) => {
    onPreset(value);
    if (value === "today") onRange(today, today);
    if (value === "day") { const day = to || today; onRange(day, day); }
    if (value === "week") onRange(addDays(today, -6), today);
    if (value === "month") onRange(monthStart(today), today);
    if (value === "year") onRange(`${today.slice(0, 4)}-01-01`, today);
    if (value === "all") onRange(allFrom || today, today);
    if (value === "custom") onRange(from || today, to || today);
  };

  return <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5 no-print" aria-label={`${label} ki tareekh`}>
    <h2 className="mb-3 font-display text-[17px] font-bold">Report ki tareekh</h2>
    <div className="flex flex-wrap gap-2">
      {(Object.keys(labels) as ReportPeriodPreset[]).map((key) => <button
        type="button" key={key} aria-pressed={preset === key} onClick={() => choose(key)}
        className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === key ? "border-ink bg-ink text-white" : "border-line"}`}
      >{labels[key]}</button>)}
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Shuru ki tareekh<input aria-label={`${label} shuru ki tareekh`} type="date" value={from} max={to || today} onChange={(event) => { onPreset("custom"); onRange(event.target.value, to); }} className={`${field} mt-1`} /></label>
      <label className="text-sm font-semibold">Aakhir ki tareekh<input aria-label={`${label} aakhir ki tareekh`} type="date" value={to} min={from || undefined} max={today} onChange={(event) => { onPreset("custom"); onRange(from, event.target.value); }} className={`${field} mt-1`} /></label>
    </div>
  </section>;
}
