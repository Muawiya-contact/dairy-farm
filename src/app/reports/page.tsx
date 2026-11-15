"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildPdfReport, downloadBlob, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { rs, litres } from "@/lib/format";
import { todayPK } from "@/lib/dates";
import { isReportDateRange, loadPeriodReport, type PeriodReport } from "@/lib/reporting";
import { sharePdfFile } from "@/lib/pdf-share";
import { Body, PageHeader, Panel } from "@/components/ui";

type Preset = "day" | "month" | "year" | "custom";
const input = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const money = (value: number) => rs(value);
const startOfMonth = (day: string) => `${day.slice(0, 7)}-01`;
const startOfYear = (day: string) => `${day.slice(0, 4)}-01-01`;
const periodLabel = (from: string, to: string) => from === to ? from : `${from} se ${to}`;

function pdfRows(data: PeriodReport): Record<string, unknown>[] {
  const summary = data.summary;
  return [
    ["Paida hua doodh (L)", litres(summary.produced)], ["Diya gaya doodh (L)", litres(summary.delivered)],
    ["Bikne wala doodh (L)", litres(summary.sold_litres)], ["Khairat / muft doodh (L)", litres(summary.free_litres)],
    ["Doodh sales billed (Rs)", money(summary.milk_income)], ["Wusooli / cash collected (Rs)", money(summary.cash_collected)],
    ["Doosri aamdani (Rs)", money(summary.other_income)], ["Farm kharcha (Rs)", money(summary.farm_expenses)],
    ["Ghar ka kharcha (Rs)", money(summary.home_expenses)], ["Farm munafa / nuqsan (Rs)", money(summary.profit)],
  ].map(([item, value]) => ({ item, value }));
}

function pdfSections(data: PeriodReport): PdfSection[] {
  return [
    { title: "Farm ka khulasa", columns: ["item", "value"], rows: pdfRows(data) },
    { title: "Customer ka period hisaab", columns: ["name", "litres", "charged", "paid", "discount", "refund", "period_balance_change"], rows: data.customers.map((row) => ({
      name: row.name, litres: litres(row.litres), charged: money(row.charged), paid: money(row.paid), discount: money(row.discount), refund: money(row.refund ?? 0), period_balance_change: money(row.period_balance_change),
    })) },
    { title: "Rozana kharchay", columns: ["expense_date", "category", "kind", "account", "amount"], rows: data.expenses.map((row) => ({
      expense_date: row.expense_date, category: `${row.category}${row.note ? ` · ${row.note}` : ""}`, kind: row.is_farm_cost ? "Farm" : "Ghar", account: row.account, amount: money(row.amount),
    })) },
  ];
}

export default function ReportsPage() {
  const today = todayPK();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(() => startOfMonth(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<"download" | "share" | "print" | null>(null);
  const [status, setStatus] = useState("");
  const valid = isReportDateRange(from, to, today);
  const report = useQuery({ queryKey: ["period-report", from, to], enabled: valid, queryFn: () => loadPeriodReport(from, to) });
  const data = report.data;
  const choose = (value: Preset) => {
    setPreset(value); setStatus("");
    if (value === "day") { setFrom(today); setTo(today); }
    if (value === "month") { setFrom(startOfMonth(today)); setTo(today); }
    if (value === "year") { setFrom(startOfYear(today)); setTo(today); }
  };
  const makePdf = async () => {
    if (!data) throw new Error("Report abhi load nahi hui.");
    return buildPdfReport(`Farm report — ${periodLabel(from, to)}`, pdfSections(data), data.farmName);
  };
  const action = async (kind: "download" | "share" | "print") => {
    if (busy || !data) return;
    setBusy(kind); setStatus("");
    try {
      if (kind === "print") { window.print(); setStatus("Print dialog khul gaya."); return; }
      const bytes = await makePdf();
      const filename = `farm-report-${from}-to-${to}.pdf`;
      if (kind === "download") {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setStatus("Report PDF download ho gayi.");
      } else {
        const outcome = await sharePdfFile(filename, bytes, `${data.farmName} report`, `${periodLabel(from, to)} ki farm report.`);
        setStatus(outcome === "shared" ? "Share sheet band hui. Recipient aur file check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "Is browser mein file share available nahi; PDF download ho gayi.");
      }
    } catch (error) { setStatus(`Report PDF nahi bani: ${friendlyError(error)}`); }
    finally { setBusy(null); }
  };

  return <><PageHeader title="Reports aur PDF" sub="Rozana, maheena, saal ya apni tareekh ka farm hisaab" />
    <Body className="space-y-4 pb-8">
      <Panel title="Report ki tareekh">
        <div className="flex flex-wrap gap-2">{(["day", "month", "year", "custom"] as const).map((value) => <button type="button" key={value} onClick={() => choose(value)} className={`min-h-11 rounded-xl border px-4 font-semibold ${preset === value ? "border-ink bg-ink text-white" : "border-line"}`}>{value === "day" ? "Aaj" : value === "month" ? "Is maheene" : value === "year" ? "Is saal" : "Apni tareekh"}</button>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Shuru ki tareekh<input aria-label="Report shuru ki tareekh" type="date" value={from} max={to || today} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); }} className={`${input} mt-1`} /></label><label className="text-sm font-semibold">Aakhir ki tareekh<input aria-label="Report aakhir ki tareekh" type="date" value={to} min={from} max={today} onChange={(event) => { setPreset("custom"); setTo(event.target.value); }} className={`${input} mt-1`} /></label></div>
        {!valid && <p role="alert" className="mt-2 text-sm text-udhaar">Aaj tak ki sahi shuru aur aakhir ki tareekh chunein.</p>}
      </Panel>
      {report.isPending && <p role="status">Report load ho rahi hai…</p>}
      {report.isError && <p role="alert" className="text-udhaar">Report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {data && <>
        <Panel title={`${periodLabel(from, to)} ka khulasa`}>
          <p className="mb-3 text-sm text-muted">Sales billed ka matlab doodh / company bill ki raqam hai. Wusooli woh paisa hai jo asal mein account mein aaya; udhaar is mein shamil nahi.</p>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
            ["Paida hua doodh", litres(data.summary.produced)], ["Diya gaya doodh", litres(data.summary.delivered)], ["Khairat / muft doodh", litres(data.summary.free_litres)],
            ["Doodh sales billed", money(data.summary.milk_income)], ["Wusooli / cash collected", money(data.summary.cash_collected)], ["Farm kharcha", money(data.summary.farm_expenses)],
            ["Ghar ka kharcha", money(data.summary.home_expenses)], ["Farm munafa / nuqsan", money(data.summary.profit)],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd></div>)}</dl>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void action("download")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button><button type="button" disabled={busy !== null} onClick={() => void action("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button><button type="button" disabled={busy !== null} onClick={() => void action("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Print</button></div>
          {status && <p role={status.includes("nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>
        <Panel title="Customer ka period hisaab"><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead><tr>{["Customer", "Doodh (L)", "Charge (Rs)", "Wusooli (Rs)", "Riayat (Rs)", "Advance wapas (Rs)", "Is muddat mein baqaya farq"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{data.customers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.charged)}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.paid)}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.discount)}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.refund ?? 0)}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.period_balance_change)}</td></tr>)}</tbody></table></div>{!data.customers.length && <p className="mt-2 text-sm text-muted">Is muddat mein customer record nahi hai.</p>}</Panel>
        <Panel title="Rozana kharchay"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr>{["Tareekh", "Tafseel", "Farm / ghar", "Account", "Raqam (Rs)"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left last:text-right">{label}</th>)}</tr></thead><tbody>{data.expenses.map((row, index) => <tr key={`${row.expense_date}-${index}`}><td className="border-b border-line px-2 py-2">{row.expense_date}</td><td className="border-b border-line px-2 py-2">{row.category}{row.note ? ` · ${row.note}` : ""}</td><td className="border-b border-line px-2 py-2">{row.is_farm_cost ? "Farm" : "Ghar"}</td><td className="border-b border-line px-2 py-2">{row.account}</td><td className="border-b border-line px-2 py-2 text-right">{money(row.amount)}</td></tr>)}</tbody></table></div>{!data.expenses.length && <p className="mt-2 text-sm text-muted">Is muddat mein kharcha nahi hai.</p>}</Panel>
      </>}
    </Body></>;
}
