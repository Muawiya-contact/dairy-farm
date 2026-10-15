"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { nextBreedingTask } from "@/lib/breeding-register";
import { shortDate, useFarmData } from "@/lib/farm-data";
import { BREEDING_COLUMNS, exportRows, fetchBreedingRegister, type ExportFormat } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const statusName: Record<string, string> = { pending: "Nateeja baqi", pregnant: "Gaabhan", empty: "Khali", aborted: "Hamla zaya", calved: "Bacha paida" };

export default function FarmBreeding() {
  const query = useFarmData();
  const [filter, setFilter] = useState("due");
  const [term, setTerm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const data = query.data;
  const rows = useMemo(() => {
    if (!data) return [];
    const animalById = new Map(data.animals.map((animal) => [animal.id, animal]));
    return data.inseminations.map((record) => {
      const animal = animalById.get(record.animal_id);
      return { record, animal, task: nextBreedingTask(record, data.today, animal?.life_status ?? "removed") };
    })
      .filter(({ record, animal, task }) => {
        if (!animal) return false;
        const matchesFilter = filter === "all" || filter === "due" && !!task && task.date <= data.today || record.status === filter;
        const search = `${animal.tag} ${animal.name ?? ""} ${record.semen_name ?? ""} ${record.semen_batch ?? ""}`.toLocaleLowerCase();
        return matchesFilter && search.includes(term.trim().toLocaleLowerCase());
      })
      .sort((a, b) => (a.task?.date ?? a.record.service_date).localeCompare(b.task?.date ?? b.record.service_date));
  }, [data, filter, term]);

  if (!data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const animalById = new Map(data.animals.map((animal) => [animal.id, animal]));
  const dueCount = data.inseminations.filter((record) => {
    const task = nextBreedingTask(record, data.today, animalById.get(record.animal_id)?.life_status ?? "removed");
    return task && task.date <= data.today;
  }).length;
  const save = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(true); setError("");
    try { await exportRows("nasl-kashi-register", "Nasl kashi register", BREEDING_COLUMNS, await fetchBreedingRegister(), format); }
    catch (problem) { setError(friendlyError(problem)); }
    finally { setExporting(false); }
  };

  return <><PageHeader title="Nasl kashi" sub={`${data.inseminations.length} records · ${dueCount} ka kaam due`} back="/janwar/" />
    <Body className="space-y-4 pb-8">
      <Panel title="Register aur due kaam">
        <p className="text-sm text-muted">Tukhm rezi, checkup, khushk hone aur paidaish ki tareekhein. Asal nateeja janwar ke record mein darj karein. Mutawaqqa tareekhein Settings ke offsets se service ke waqt banti hain.</p>
        <div className="mt-3 flex flex-wrap gap-2">{(["due", "pending", "pregnant", "calved", "empty", "aborted", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${filter === value ? "border-ink bg-ink text-white" : "border-line"}`}>{value === "due" ? "Due / late" : value === "all" ? "Sab" : statusName[value]}</button>)}</div>
        <label className="mt-3 block text-sm font-semibold">Tag, naam ya semen se dhoondein<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Misal: 123" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3" /></label>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Poora register export:</span>{(["csv", "xlsx", "pdf"] as const).map((format) => <button key={format} disabled={exporting} onClick={() => void save(format)} className="min-h-10 rounded-xl border border-berseem px-3 text-sm font-semibold uppercase text-berseem disabled:opacity-50">{format === "xlsx" ? "Excel" : format}</button>)}</div>
        {error && <p role="alert" className="mt-2 text-sm text-udhaar">Export nahi hua: {error}</p>}
      </Panel>
      <ul className="grid gap-3 lg:grid-cols-2">{rows.map(({ record, animal, task }) => <li key={record.id} className="rounded-2xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><Link href={`/janwar/?id=${animal!.id}`} className="font-display text-lg font-bold text-berseem underline">{animal!.tag}{animal!.name ? ` · ${animal!.name}` : ""}</Link><p className="text-sm text-muted">Tukhm rezi {shortDate(record.service_date)} · {record.semen_type}{record.semen_name ? ` · ${record.semen_name}` : ""}</p></div><strong className="text-sm">{statusName[record.status] ?? record.status}</strong></div>
        {task && <p className={`mt-2 text-sm font-semibold ${task.date < data.today ? "text-udhaar" : "text-berseem"}`}>{task.label}: {shortDate(task.date)}{task.date < data.today ? " · Tareekh guzar chuki" : task.date === data.today ? " · Aaj" : ""}</p>}
        <div className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2"><span>Ultrasound: {record.ultrasound_date ? shortDate(record.ultrasound_date) : `mutawaqqa ${shortDate(record.ultrasound_due)}`}</span><span>Checkup: {record.checkup_date ? shortDate(record.checkup_date) : `mutawaqqa ${shortDate(record.checkup_due)}`}</span><span>Khushk: {record.dry_off_date ? shortDate(record.dry_off_date) : `mutawaqqa ${shortDate(record.dry_off_due)}`}</span><span>Paidaish: {shortDate(record.calving_due)}</span></div>
      </li>)}{rows.length === 0 && <li className="rounded-2xl border border-line bg-paper p-6 text-muted">Is filter mein koi record nahi. Janwar ke page se nayi tukhm rezi darj karein.</li>}</ul>
    </Body></>;
}
