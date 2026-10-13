"use client";

import { useState } from "react";
import Link from "next/link";
import { BREEDING_COLUMNS, DATASETS, REPORTS, downloadFile, exportRows, fetchBreedingRegister, fetchDataset, fetchReport, type ExportFormat } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { todayPK } from "@/lib/dates";

const buttonClass = "min-h-11 rounded-xl border border-line px-3 text-left text-sm font-semibold hover:border-berseem disabled:opacity-50";

export function ExportPanel() {
  const [month, setMonth] = useState(() => todayPK().slice(0, 7));
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label); setError(""); setMessage("");
    try { await task(); setMessage(`${label} export ho gaya.`); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(""); }
  };
  const exportTable = (dataset: (typeof DATASETS)[number]) => void run(dataset.label, async () => {
    const rows = await fetchDataset(dataset);
    await exportRows(`dairy-${dataset.table}`, dataset.label, dataset.columns, rows, format);
  });
  const exportReport = (report: (typeof REPORTS)[number]) => void run(report.label, async () => {
    const rows = await fetchReport(report.name, month);
    await exportRows(`dairy-${report.name}-${month}`, report.label, [...report.columns], rows, format);
  });
  const exportBackup = () => void run("Mukammal JSON", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const dataset of DATASETS) tables[dataset.table] = await fetchDataset(dataset);
    downloadFile(`dairy-data-${todayPK()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), tables }, null, 2), "application/json;charset=utf-8");
  });
  const exportBreeding = () => void run("Nasl kashi register", async () => {
    const rows = await fetchBreedingRegister();
    await exportRows("dairy-nasl-kashi-register", "Nasl kashi register", BREEDING_COLUMNS, rows, format);
  });

  return <section className="max-w-4xl rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-display text-xl font-bold">Data export</h2>
    <p className="mt-1 text-sm text-muted">Supabase ka abhi wala data download karein. Har report aur table CSV, Excel ya PDF mein milti hai. JSON mein tamam tables hain. Khali table mein bhi column naam honge.</p>
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Report ka maheena<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block min-h-11 rounded-xl border border-line bg-paper px-3" /></label>
      <label className="text-sm font-semibold">File ki qism<select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="mt-1 block min-h-11 rounded-xl border border-line bg-paper px-3"><option value="csv">CSV</option><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option></select></label>
      <button type="button" disabled={!!busy} onClick={exportBackup} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">{busy === "Mukammal JSON" ? "Download ho raha hai…" : "Tamam data JSON"}</button>
    </div>
    <h3 className="mt-5 font-semibold">Maheene ki reports</h3>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">{REPORTS.map((report) => <button key={report.name} type="button" disabled={!!busy || !month} onClick={() => exportReport(report)} className={buttonClass}>{report.label} · {format.toUpperCase()}</button>)}</div>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={exportBreeding} className={buttonClass}>Nasl kashi register · {format.toUpperCase()}</button><Link href="/reports/" className={`${buttonClass} inline-flex items-center`}>Maheene ki report dekhein / PDF save karein</Link></div>
    <h3 className="mt-5 font-semibold">Har table ka export</h3>
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DATASETS.map((dataset) => <button key={dataset.table} type="button" disabled={!!busy} onClick={() => exportTable(dataset)} className={buttonClass}>{dataset.label} · {format.toUpperCase()}</button>)}</div>
    {busy && <p role="status" className="mt-3 text-sm text-muted">{busy} tayyar ho raha hai…</p>}
    {message && <p role="status" className="mt-3 text-sm text-berseem-deep">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-udhaar">Export nahi hua: {error}</p>}
  </section>;
}
