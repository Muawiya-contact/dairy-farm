"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import { buildPdfReport, downloadBlob, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { rs, litres } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { addDays, todayPK } from "@/lib/dates";
import { isReportDateRange, loadKhataPeriodSummary, loadKhataYearMonthSummary, type KhataPeriodCustomer } from "@/lib/reporting";
import { sharePdfFile } from "@/lib/pdf-share";

type Preset = "day" | "week" | "month" | "year" | "all" | "custom";
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const startMonth = (day: string) => `${day.slice(0, 7)}-01`;
const startYear = (day: string) => `${day.slice(0, 4)}-01-01`;

function totals(rows: KhataPeriodCustomer[]) {
  return rows.reduce((sum, row) => ({ litres: sum.litres + row.litres, charges: sum.charges + row.charges, payments: sum.payments + row.payments, discounts: sum.discounts + row.discounts, refunds: sum.refunds + row.refunds, opening: sum.opening + row.opening_balance, openingAdded: sum.openingAdded + row.opening_added, closing: sum.closing + row.closing_balance }), { litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, opening: 0, openingAdded: 0, closing: 0 });
}

export default function KhataSummaryReport({ title = "Khata Summary" }: { title?: string }) {
  const today = todayPK();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(startMonth(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<"download" | "share" | "print" | null>(null);
  const [status, setStatus] = useState("");
  const valid = isReportDateRange(from, to, today);
  const summary = useQuery({ queryKey: ["khata-summary", from, to], enabled: valid, queryFn: () => loadKhataPeriodSummary(from, to) });
  const yearly = useQuery({ queryKey: ["khata-summary-year", from.slice(0, 4)], enabled: valid && preset === "year", queryFn: () => loadKhataYearMonthSummary(Number(from.slice(0, 4))) });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });
  const rows = summary.data ?? [];
  const grand = totals(rows);
  const choose = (value: Preset) => {
    setPreset(value); setStatus("");
    if (value === "day") { setFrom(today); setTo(today); }
    if (value === "week") { setFrom(addDays(today, -6)); setTo(today); }
    if (value === "month") { setFrom(startMonth(today)); setTo(today); }
    if (value === "year") { setFrom(startYear(today)); setTo(today); }
    if (value === "all") { setFrom(addDays(today, -3660)); setTo(today); }
  };
  const exportPdf = async (kind: "download" | "share" | "print") => {
    if (busy || !settings.data) return;
    setBusy(kind); setStatus("");
    try {
      if (kind === "print") { window.print(); setStatus("Print dialog khul gaya."); return; }
      const totalRows = [["Kul doodh", `${litres(grand.litres)}`], ["Kul charges", rs(grand.charges)], ["Kul wusooli", rs(grand.payments)], ["Kul riayat", rs(grand.discounts)], ["Advance wapas", rs(grand.refunds)], ["Shuru ka baqaya", rs(grand.opening)], ["Is muddat ka opening balance", rs(grand.openingAdded)], ["Aakhir ka baqaya", rs(grand.closing)]].map(([item, value]) => ({ item, value }));
      const sections: PdfSection[] = [{ title: "Grand summary", columns: ["item", "value"], rows: totalRows }, { title: "Customer khata summary", columns: ["name", "litres", "charges", "payments", "discounts", "refunds", "opening_balance", "opening_added", "closing_balance"], rows: rows.map((row) => ({ name: row.name, litres: litres(row.litres), charges: rs(row.charges), payments: rs(row.payments), discounts: rs(row.discounts), refunds: rs(row.refunds), opening_balance: rs(row.opening_balance), opening_added: rs(row.opening_added), closing_balance: rs(row.closing_balance) })) }];
      if (preset === "year" && yearly.data) sections.push({ title: "Maheena ba maheena", columns: ["month_start", "litres", "charges", "payments", "discounts", "refunds", "closing_balance"], rows: yearly.data.map((row) => ({ ...row, litres: litres(row.litres), charges: rs(row.charges), payments: rs(row.payments), discounts: rs(row.discounts), refunds: rs(row.refunds), closing_balance: rs(row.closing_balance) })) });
      const bytes = await buildPdfReport(`Khata summary — ${from} se ${to}`, sections, settings.data.farm_name);
      const filename = `khata-summary-${from}-to-${to}.pdf`;
      if (kind === "download") { downloadBlob(filename, new Blob([bytes], { type: "application/pdf" })); setStatus("Khata summary PDF download ho gayi."); }
      else { const outcome = await sharePdfFile(filename, bytes, `${settings.data.farm_name} Khata summary`, `${from} se ${to} ka Khata summary.`); setStatus(outcome === "shared" ? "Share sheet band hui. File check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "Is browser mein file share available nahi; PDF download ho gayi."); }
    } catch (error) { setStatus(`PDF nahi bani: ${friendlyError(error)}`); } finally { setBusy(null); }
  };
  return <><PageHeader title={title} sub="Sab customers ka baqaya aur wusooli ek jagah" back="/reports/" /><Body className="space-y-4 pb-8"><Panel title="Report ki tareekh"><div className="flex flex-wrap gap-2">{(["day", "week", "month", "year", "all", "custom"] as const).map((key) => <button type="button" key={key} onClick={() => choose(key)} className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === key ? "border-ink bg-ink text-white" : "border-line"}`}>{({ day: "Aaj", week: "Hafta", month: "Maheena", year: "Saal", all: "Sab record", custom: "Apni tareekh" } as Record<Preset, string>)[key]}</button>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Shuru ki tareekh<input aria-label="Khata summary shuru ki tareekh" type="date" value={from} max={to || today} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className={`${field} mt-1`} /></label><label className="text-sm font-semibold">Aakhir ki tareekh<input aria-label="Khata summary aakhir ki tareekh" type="date" value={to} min={from} max={today} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className={`${field} mt-1`} /></label></div>{!valid && <p role="alert" className="mt-2 text-sm text-udhaar">Aaj tak ki sahi shuru aur aakhir ki tareekh chunein.</p>}</Panel>{summary.isPending && <p role="status">Khata summary load ho rahi hai…</p>}{summary.isError && <p role="alert" className="text-udhaar">Khata summary nahi khuli: {friendlyError(summary.error)} <button type="button" onClick={() => void summary.refetch()} className="underline">Dobara koshish</button></p>}{summary.data && <><Panel title={`${from} se ${to} ka grand total`}><dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["Kul doodh", litres(grand.litres)], ["Charges", rs(grand.charges)], ["Wusooli", rs(grand.payments)], ["Riayat", rs(grand.discounts)], ["Advance wapas", rs(grand.refunds)], ["Shuru ka baqaya", rs(grand.opening)], ["Is muddat ka opening balance", rs(grand.openingAdded)], ["Aakhir ka baqaya", rs(grand.closing)]].map(([label, value]) => <div className="rounded-xl bg-ground p-3" key={String(label)}><dt className="text-sm text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl></Panel><Panel title="Customer-wise Khata"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead><tr>{["Customer", "Doodh", "Charges", "Wusooli", "Riayat", "Advance wapas", "Shuru", "Is muddat ka opening", "Aakhir"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2"><Link className="font-semibold text-berseem underline" href={`/reports/customer/?id=${row.customer_id}&from=${from}&to=${to}`}>{row.name}</Link>{!row.active && <span className="ml-1 text-muted">(Band)</span>}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_added)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{rs(row.closing_balance)}</td></tr>)}</tbody></table></div>{!rows.length && <p className="mt-3 text-sm text-muted">Is muddat mein koi customer baqaya ya record nahi hai.</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void exportPdf("download")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button><button type="button" disabled={busy !== null} onClick={() => void exportPdf("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button><button type="button" disabled={busy !== null} onClick={() => void exportPdf("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold">Print</button></div>{status && <p role={status.startsWith("PDF nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}</Panel>{preset === "year" && <Panel title="Maheena ba maheena"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr>{["Maheena", "Doodh", "Charges", "Wusooli", "Riayat", "Advance wapas", "Aakhir ka baqaya"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{(yearly.data ?? []).map((row) => <tr key={row.month_start}><td className="border-b border-line px-2 py-2">{row.month_start}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{rs(row.closing_balance)}</td></tr>)}</tbody></table></div>{yearly.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Saal ka khulasa nahi khula: {friendlyError(yearly.error)}</p>}</Panel>}</>}</Body></>;
}
