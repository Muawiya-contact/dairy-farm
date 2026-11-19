"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "@/components/ui";
import { buildPdfReport, downloadBlob, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { rs } from "@/lib/format";
import { todayPK } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { sharePdfFile } from "@/lib/pdf-share";
import {
  isKharchaReportDateRange, kharchaMonthRange, kharchaYearRange,
  loadAllKharchaReportRows, loadKharchaReportBounds, loadKharchaReportCategories,
  loadKharchaReportPeople, loadKharchaReportRows, loadKharchaReportSummary,
  type KharchaReportCategory, type KharchaReportRow,
} from "@/lib/kharcha-report";

type Preset = "today" | "date" | "range" | "month" | "year" | "all";
type PdfAction = "download" | "share" | "print";
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const pageSize = 50;
const typeLabel = (type: string) => type === "farm" ? "Farm" : type === "home" ? "Ghar" : "Zaati";
const periodLabel = (from: string, to: string) => from === to ? from : `${from} se ${to}`;

function makePdfSections(
  from: string, to: string, recipient: string, today: string,
  summary: { entry_count: number; total_expenses: number; farm_expenses: number; home_expenses: number; personal_expenses: number },
  categories: KharchaReportCategory[], rows: KharchaReportRow[],
): PdfSection[] {
  return [
    { title: "Kharchay ka khulasa", columns: ["item", "value"], rows: [
      { item: "Report ki muddat", value: periodLabel(from, to) },
      { item: "PDF ki tareekh", value: today },
      { item: "Raqam lene wala", value: recipient || "Sab afrad" },
      { item: "Entries ki tadaad", value: summary.entry_count },
      { item: "Kul kharcha", value: rs(summary.total_expenses) },
      { item: "Farm kharcha", value: rs(summary.farm_expenses) },
      { item: "Ghar ka kharcha", value: rs(summary.home_expenses) },
      { item: "Zaati kharcha", value: rs(summary.personal_expenses) },
    ] },
    { title: "Category ke mutabiq", columns: ["category", "expense_type", "entry_count", "total_amount"], rows: categories.map((row) => ({
      category: row.category, expense_type: typeLabel(row.expense_type), entry_count: row.entry_count, total_amount: rs(row.total_amount),
    })) },
    { title: "Tafseeli entries", columns: ["expense_date", "description", "category", "account", "expense_type", "recipient", "amount"], rows: rows.map((row) => ({
      expense_date: row.expense_date, description: row.description, category: row.category, account: row.account,
      expense_type: typeLabel(row.expense_type), recipient: row.recipient ?? "", amount: rs(row.amount),
    })) },
  ];
}

const escapeHtml = (value: string | number) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

function printTable(headers: string[], rows: (string | number)[][]) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) =>
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function makePrintHtml(
  farmName: string, from: string, to: string, recipient: string, today: string,
  summary: { entry_count: number; total_expenses: number; farm_expenses: number; home_expenses: number; personal_expenses: number },
  categories: KharchaReportCategory[], rows: KharchaReportRow[],
) {
  const title = `${farmName} — Kharcha Report`;
  const summaryRows = [
    ["Report ki muddat", periodLabel(from, to)], ["Report ki tareekh", today],
    ["Raqam lene wala", recipient || "Sab afrad"], ["Kharchon ki tadaad", summary.entry_count],
    ["Kul kharcha", rs(summary.total_expenses)], ["Farm kharcha", rs(summary.farm_expenses)],
    ["Ghar ka kharcha", rs(summary.home_expenses)], ["Zaati kharcha", rs(summary.personal_expenses)],
  ];
  const categoryRows = categories.map((row) => [row.category, typeLabel(row.expense_type), row.entry_count, rs(row.total_amount)]);
  const expenseRows = rows.map((row) => [row.expense_date, row.description, row.category, row.account,
    typeLabel(row.expense_type), row.recipient ?? "—", rs(row.amount)]);
  return `<!doctype html><html lang="ur-Latn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
    <style>
      *{box-sizing:border-box}body{margin:0;padding:28px;color:#17251b;font:14px/1.45 Arial,sans-serif}main{max-width:1180px;margin:auto}header{border-bottom:2px solid #314d38;padding-bottom:14px}h1{margin:0;font-size:25px}header p{margin:5px 0 0;color:#526257}section{margin-top:20px}h2{margin:0 0 8px;font-size:17px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5cc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3ee;font-weight:700}tbody tr{break-inside:avoid}section:first-of-type td:first-child{width:30%;font-weight:600}section:nth-of-type(2) th:nth-child(n+2),section:nth-of-type(2) td:nth-child(n+2){text-align:right}section:nth-of-type(3) th:last-child,section:nth-of-type(3) td:last-child{text-align:right;white-space:nowrap}footer{margin-top:18px;color:#526257;font-size:11px}
      @page{size:A4 landscape;margin:12mm}@media print{body{padding:0}main{max-width:none}thead{display:table-header-group}h2{break-after:avoid}}
    </style></head><body><main><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(periodLabel(from, to))} · ${escapeHtml(today)}</p></header>
      <section><h2>Kharchay ka khulasa</h2>${printTable(["Pehlu", "Tafseel"], summaryRows)}</section>
      <section><h2>Category ke mutabiq</h2>${printTable(["Category", "Qism", "Entries", "Raqam (Rs)"], categoryRows)}</section>
      <section><h2>Tafseeli kharchay</h2>${printTable(["Tareekh", "Tafseel", "Category", "Account", "Qism", "Raqam lene wala", "Raqam (Rs)"], expenseRows)}</section>
      <footer>${escapeHtml(farmName)} · Kharcha Report</footer></main></body></html>`;
}

export default function KharchaReport() {
  const today = todayPK();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [singleDate, setSingleDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [recipient, setRecipient] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<PdfAction | null>(null);
  const [status, setStatus] = useState("");

  const bounds = useQuery({ queryKey: ["kharcha-report-bounds"], queryFn: loadKharchaReportBounds, staleTime: 60_000 });
  const range = preset === "date" ? { from: singleDate, to: singleDate }
    : preset === "month" ? kharchaMonthRange(month, today)
    : preset === "year" ? kharchaYearRange(year, today)
    : preset === "all" ? { from: bounds.data?.first_date || today, to: today }
    : { from, to };
  const valid = isKharchaReportDateRange(range.from, range.to, today);
  const report = useQuery({
    queryKey: ["kharcha-report", range.from, range.to, recipient || null],
    enabled: valid,
    queryFn: async () => {
      const [summary, categories] = await Promise.all([
        loadKharchaReportSummary(range.from, range.to, recipient || null),
        loadKharchaReportCategories(range.from, range.to, recipient || null),
      ]);
      return { summary, categories };
    },
  });
  const totalPages = report.data ? Math.max(1, Math.ceil(report.data.summary.entry_count / pageSize)) : 1;
  const effectivePage = Math.min(page, totalPages - 1);
  const rows = useQuery({
    queryKey: ["kharcha-report-rows", range.from, range.to, recipient || null, effectivePage],
    enabled: valid && report.data !== undefined,
    queryFn: () => loadKharchaReportRows(range.from, range.to, recipient || null, pageSize, effectivePage * pageSize),
  });
  const people = useQuery({
    queryKey: ["kharcha-report-people", range.from, range.to], enabled: valid,
    queryFn: () => loadKharchaReportPeople(range.from, range.to),
  });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });

  const choose = (value: Preset) => {
    setPreset(value); setRecipient(""); setPage(0); setStatus("");
    if (value === "today") { setFrom(today); setTo(today); setSingleDate(today); }
    if (value === "date") setSingleDate(today);
    if (value === "range") { setFrom(today); setTo(today); }
    if (value === "month") setMonth(today.slice(0, 7));
    if (value === "year") setYear(today.slice(0, 4));
  };

  const action = async (kind: PdfAction) => {
    if (busy || !report.data || !settings.data || !valid) return;
    const printWindow = kind === "print" ? window.open("about:blank", "_blank") : null;
    setBusy(kind); setStatus("");
    try {
      const [allRows, summary, categories] = await Promise.all([
        loadAllKharchaReportRows(range.from, range.to, recipient || null),
        loadKharchaReportSummary(range.from, range.to, recipient || null),
        loadKharchaReportCategories(range.from, range.to, recipient || null),
      ]);
      const rowTotal = allRows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
      const categoryTotal = categories.reduce((sum, row) => sum + Math.round(row.total_amount * 100), 0);
      const sumType = (type: string) => categories.filter((row) => row.expense_type === type)
        .reduce((sum, row) => sum + Math.round(row.total_amount * 100), 0);
      const categoryCount = categories.reduce((sum, row) => sum + row.entry_count, 0);
      if (allRows.length !== summary.entry_count || categoryCount !== summary.entry_count
        || rowTotal !== Math.round(summary.total_expenses * 100) || categoryTotal !== rowTotal
        || sumType("farm") !== Math.round(summary.farm_expenses * 100)
        || sumType("home") !== Math.round(summary.home_expenses * 100)
        || sumType("personal") !== Math.round(summary.personal_expenses * 100)) {
        throw new RangeError("Report export se pehle entries badal gayin. Dobara load karke export karein.");
      }
      const bytes = await buildPdfReport(
        `Kharcha Report — ${periodLabel(range.from, range.to)}`,
        makePdfSections(range.from, range.to, recipient, today, summary, categories, allRows),
        settings.data.farm_name,
      );
      const filename = `kharcha-report-${range.from}-to-${range.to}.pdf`;
      if (kind === "download") {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setStatus("Kharcha Report PDF download ho gayi.");
      } else if (kind === "share") {
        const outcome = await sharePdfFile(filename, bytes, `${settings.data.farm_name} Kharcha Report`, `${periodLabel(range.from, range.to)} ka kharcha report.`);
        setStatus(outcome === "shared" ? "Share sheet khul gayi. File aur recipient check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "File share dastiyab nahi thi; PDF download ho gayi.");
      } else if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(makePrintHtml(settings.data.farm_name, range.from, range.to, recipient, today, summary, categories, allRows));
        printWindow.document.close();
        window.setTimeout(() => {
          if (!printWindow.closed) {
            printWindow.focus();
            printWindow.print();
            setStatus("Report print ke liye tayyar hai.");
          }
        }, 250);
      } else {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setStatus("Popup band hai; PDF download ho gayi.");
      }
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      setStatus(`PDF tayyar nahi hui: ${friendlyError(error)}`);
    } finally { setBusy(null); }
  };

  const data = report.data;
  return <>
    <PageHeader title="Kharcha Report" sub="Farm, ghar aur zaati kharchay; raqam lene wala aur account alag" back="/reports/" />
    <Body className="space-y-4 pb-8">
      <Panel title="Report ki muddat">
        <div className="flex flex-wrap gap-2">
          {(["today", "date", "range", "month", "year", "all"] as const).map((key) => <button key={key} type="button" aria-pressed={preset === key} disabled={key === "all" && (bounds.isPending || bounds.isError)} onClick={() => choose(key)} className={`min-h-11 rounded-xl border px-3 font-semibold disabled:opacity-50 ${preset === key ? "border-ink bg-ink text-white" : "border-line"}`}>
            {({ today: "Aaj", date: "Ek tareekh", range: "Tareekh se tak", month: "Mahina", year: "Saal", all: "Sab record" } as Record<Preset, string>)[key]}
          </button>)}
        </div>
        {preset === "date" && <label className="mt-3 block max-w-sm text-sm font-semibold">Tareekh<input aria-label="Kharcha report tareekh" type="date" max={today} value={singleDate} onChange={(event) => { setSingleDate(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`} /></label>}
        {preset === "range" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Shuru<input aria-label="Kharcha report shuru" type="date" max={to || today} value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`} /></label><label className="text-sm font-semibold">Aakhir<input aria-label="Kharcha report aakhir" type="date" min={from} max={today} value={to} onChange={(event) => { setTo(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`} /></label></div>}
        {preset === "month" && <label className="mt-3 block max-w-sm text-sm font-semibold">Maheena<input aria-label="Kharcha report maheena" type="month" max={today.slice(0, 7)} value={month} onChange={(event) => { setMonth(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`} /></label>}
        {preset === "year" && <label className="mt-3 block max-w-sm text-sm font-semibold">Saal<input aria-label="Kharcha report saal" type="number" min="1900" max={today.slice(0, 4)} value={year} onChange={(event) => { setYear(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`} /></label>}
        {preset === "all" && <p className="mt-3 text-sm text-muted">{bounds.data?.first_date ? `${bounds.data.first_date} se ${today} tak` : `Abhi koi entry nahi; ${today} ka khali report dikhayega.`}</p>}
        {!valid && <p role="alert" className="mt-2 text-sm text-udhaar">Aaj tak ki sahi tareekh chunein.</p>}
        {bounds.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Pehli entry ki tareekh nahi mili: {friendlyError(bounds.error)} <button type="button" onClick={() => void bounds.refetch()} className="underline">Dobara koshish</button></p>}
      </Panel>
      {valid && <Panel title="Raqam lene wala">
        <label className="block max-w-lg text-sm font-semibold">Afraad ke mutabiq filter<select aria-label="Raqam lene wala filter" value={recipient} onChange={(event) => { setRecipient(event.target.value); setPage(0); setStatus(""); }} className={`${field} mt-1`}>
          <option value="">Sab afrad</option>
          {recipient && !people.data?.includes(recipient) && <option value={recipient}>{recipient}</option>}
          {(people.data ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        {people.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Afraad ki list load nahi hui: {friendlyError(people.error)}</p>}
      </Panel>}
      {report.isPending && valid && <p role="status" className="text-sm text-muted">Kharcha report load ho rahi hai…</p>}
      {report.isError && <p role="alert" className="text-sm text-udhaar">Kharcha report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {rows.isPending && data && <p role="status" className="text-sm text-muted">Kharchay ki entries load ho rahi hain…</p>}
      {rows.isError && <p role="alert" className="text-sm text-udhaar">Kharchay ki entries nahi khulin: {friendlyError(rows.error)} <button type="button" onClick={() => void rows.refetch()} className="underline">Dobara koshish</button></p>}
      {data && <>
        <Panel title={`${periodLabel(range.from, range.to)} ka khulasa`}>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{[
            ["Kharchon ki tadaad", String(data.summary.entry_count)], ["Kul kharcha", rs(data.summary.total_expenses)],
            ["Farm kharcha", rs(data.summary.farm_expenses)], ["Ghar", rs(data.summary.home_expenses)], ["Zaati", rs(data.summary.personal_expenses)],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd></div>)}</dl>
          {data.summary.entry_count === 0 && <p className="mt-3 text-sm text-muted">Is muddat mein kharcha darj nahi hai.</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== null || !settings.data} onClick={() => void action("download")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button><button type="button" disabled={busy !== null || !settings.data} onClick={() => void action("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button><button type="button" disabled={busy !== null || !settings.data} onClick={() => void action("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Print</button></div>
          {settings.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Farm ki tafseel nahi mili: {friendlyError(settings.error)} <button type="button" onClick={() => void settings.refetch()} className="underline">Dobara koshish</button></p>}
          {status && <p role={status.startsWith("PDF tayyar nahi hui") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>
        <Panel title="Category ke mutabiq">
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr>{["Category", "Qism", "Entries", "Raqam (Rs)"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{data.categories.map((row) => <tr key={`${row.expense_type}-${row.category}`}><td className="border-b border-line px-2 py-2">{row.category}</td><td className="border-b border-line px-2 py-2 text-right">{typeLabel(row.expense_type)}</td><td className="border-b border-line px-2 py-2 text-right">{row.entry_count}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.total_amount)}</td></tr>)}</tbody></table></div>
          {!data.categories.length && <p className="mt-2 text-sm text-muted">Is muddat mein category entry nahi.</p>}
        </Panel>
        <Panel title="Tafseeli kharchay" aside={<span className="text-sm text-muted">{data.summary.entry_count} total</span>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead><tr>{["Tareekh", "Tafseel", "Category", "Paisa kis account se nikla", "Farm / ghar / zaati", "Raqam lene wala", "Raqam (Rs)"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left last:text-right">{label}</th>)}</tr></thead><tbody>{(rows.data ?? []).map((row) => <tr key={row.expense_id}><td className="border-b border-line px-2 py-2">{row.expense_date}</td><td className="border-b border-line px-2 py-2">{row.description}</td><td className="border-b border-line px-2 py-2">{row.category}</td><td className="border-b border-line px-2 py-2">{row.account}</td><td className="border-b border-line px-2 py-2">{typeLabel(row.expense_type)}</td><td className="border-b border-line px-2 py-2">{row.recipient ?? "—"}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.amount)}</td></tr>)}</tbody></table></div>
          {rows.data && !rows.data.length && <p className="mt-2 text-sm text-muted">Is page par koi expense row nahi.</p>}
          <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-muted">Safha {effectivePage + 1} / {totalPages} · {pageSize} kharchay har safhay par</p><div className="flex gap-2"><button type="button" disabled={effectivePage === 0 || rows.isFetching} onClick={() => setPage(Math.max(0, effectivePage - 1))} className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-50">Pichla</button><button type="button" disabled={effectivePage + 1 >= totalPages || rows.isFetching} onClick={() => setPage(effectivePage + 1)} className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-50">Agla</button></div></div>
        </Panel>
      </>}
    </Body>
  </>;
}
