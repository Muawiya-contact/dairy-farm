"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import { buildPdfReport, buildXlsx, downloadBlob, downloadFile, toCsv, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { rs, litres } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { addDays, todayPK } from "@/lib/dates";
import { isReportDateRange, loadKhataPeriodSummary, loadKhataYearMonthSummary, type KhataPeriodCustomer } from "@/lib/reporting";
import { filterAndSortKhataCustomers, type KhataCustomerSortKey, type SortDirection } from "@/lib/khata-summary";
import { sharePdfFile } from "@/lib/pdf-share";

type Preset = "day" | "yesterday" | "week" | "month" | "year" | "all" | "custom";
type ExportAction = "pdf" | "share" | "print" | "csv" | "excel";
const PAGE_SIZE = 25;
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const columns = ["name", "litres", "charges", "payments", "discounts", "refunds", "opening_balance", "opening_added", "closing_balance"];
const sortLabels: Record<KhataCustomerSortKey, string> = {
  name: "Naam",
  litres: "Doodh",
  charges: "Bill",
  payments: "Wasooli",
  closing_balance: "Aakhir ka baqaya",
};
const startMonth = (day: string) => `${day.slice(0, 7)}-01`;
const startYear = (day: string) => `${day.slice(0, 4)}-01-01`;

function totals(rows: KhataPeriodCustomer[]) {
  return rows.reduce((sum, row) => ({
    litres: sum.litres + row.litres,
    charges: sum.charges + row.charges,
    payments: sum.payments + row.payments,
    discounts: sum.discounts + row.discounts,
    refunds: sum.refunds + row.refunds,
    opening: sum.opening + row.opening_balance,
    openingAdded: sum.openingAdded + row.opening_added,
    closing: sum.closing + row.closing_balance,
  }), { litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, opening: 0, openingAdded: 0, closing: 0 });
}

function exportRows(rows: KhataPeriodCustomer[]) {
  const summary = totals(rows);
  return [
    ...rows.map((row) => ({
      name: row.name,
      litres: row.litres,
      charges: row.charges,
      payments: row.payments,
      discounts: row.discounts,
      refunds: row.refunds,
      opening_balance: row.opening_balance,
      opening_added: row.opening_added,
      closing_balance: row.closing_balance,
    })),
    {
      name: "Kul (filter ke mutabiq)",
      litres: summary.litres,
      charges: summary.charges,
      payments: summary.payments,
      discounts: summary.discounts,
      refunds: summary.refunds,
      opening_balance: summary.opening,
      opening_added: summary.openingAdded,
      closing_balance: summary.closing,
    },
  ];
}

function dateLabel(preset: Preset): string {
  return ({ day: "Aaj", yesterday: "Kal", week: "Hafta", month: "Maheena", year: "Saal", all: "Aakhri 10 saal", custom: "Apni tareekh" } as Record<Preset, string>)[preset];
}

export default function KhataSummaryReport({ title = "Khata Summary" }: { title?: string }) {
  const today = todayPK();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(startMonth(today));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<KhataCustomerSortKey>("name");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [status, setStatus] = useState("");
  const valid = isReportDateRange(from, to, today);
  const summary = useQuery({ queryKey: ["khata-summary", from, to], enabled: valid, queryFn: () => loadKhataPeriodSummary(from, to) });
  const yearly = useQuery({ queryKey: ["khata-summary-year", from.slice(0, 4)], enabled: valid && preset === "year", queryFn: () => loadKhataYearMonthSummary(Number(from.slice(0, 4))) });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });
  const rows = useMemo(() => summary.data ?? [], [summary.data]);
  const grand = totals(rows);
  const matchingRows = useMemo(() => filterAndSortKhataCustomers(rows, search, sortKey, direction), [rows, search, sortKey, direction]);
  const pageCount = Math.max(1, Math.ceil(matchingRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = matchingRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const matchingTotals = totals(matchingRows);

  const choose = (value: Preset) => {
    setPreset(value);
    setPage(1);
    setStatus("");
    if (value === "day") { setFrom(today); setTo(today); }
    if (value === "yesterday") { const yesterday = addDays(today, -1); setFrom(yesterday); setTo(yesterday); }
    if (value === "week") { setFrom(addDays(today, -6)); setTo(today); }
    if (value === "month") { setFrom(startMonth(today)); setTo(today); }
    if (value === "year") { setFrom(startYear(today)); setTo(today); }
    if (value === "all") { setFrom(addDays(today, -3660)); setTo(today); }
  };

  const exportPdf = async (kind: "pdf" | "share" | "print") => {
    if (busy) return;
    if (kind !== "print" && !settings.data) return;
    setBusy(kind);
    setStatus("");
    try {
      if (kind === "print") { window.print(); setStatus("Print dialog khul gaya."); return; }
      if (!settings.data) return;
      const farmName = settings.data.farm_name;
      const totalRows = [
        ["Kul doodh", litres(grand.litres)], ["Kul charges", rs(grand.charges)], ["Kul wusooli", rs(grand.payments)],
        ["Kul riayat", rs(grand.discounts)], ["Advance wapas", rs(grand.refunds)], ["Shuru ka baqaya", rs(grand.opening)],
        ["Is muddat ka opening balance", rs(grand.openingAdded)], ["Aakhir ka baqaya", rs(grand.closing)],
      ].map(([item, value]) => ({ item, value }));
      const filteredTotalRows = [
        ["Matching customers", String(matchingRows.length)], ["Doodh", litres(matchingTotals.litres)],
        ["Charges", rs(matchingTotals.charges)], ["Wusooli", rs(matchingTotals.payments)],
        ["Aakhir ka baqaya", rs(matchingTotals.closing)],
      ].map(([item, value]) => ({ item, value }));
      const sections: PdfSection[] = [
        { title: "Grand summary — tamam customers", columns: ["item", "value"], rows: totalRows },
        { title: "Customer filter ka khulasa", columns: ["item", "value"], rows: filteredTotalRows },
        { title: "Customer khata summary", columns, rows: exportRows(matchingRows) },
      ];
      if (preset === "year" && yearly.data) sections.push({ title: "Maheena ba maheena — tamam customers", columns: ["month_start", "litres", "charges", "payments", "discounts", "refunds", "closing_balance"], rows: yearly.data.map((row) => ({ ...row, litres: litres(row.litres), charges: rs(row.charges), payments: rs(row.payments), discounts: rs(row.discounts), refunds: rs(row.refunds), closing_balance: rs(row.closing_balance) })) });
      const reportTitle = `${title} — ${from} se ${to}`;
      const bytes = await buildPdfReport(reportTitle, sections, farmName);
      const filename = `${title === "Customer Report" ? "customer-report" : "khata-summary"}-${from}-to-${to}.pdf`;
      if (kind === "pdf") { downloadBlob(filename, new Blob([bytes], { type: "application/pdf" })); setStatus("Khata summary PDF download ho gayi."); }
      else {
        const outcome = await sharePdfFile(filename, bytes, `${farmName} ${title}`, `${from} se ${to} ka ${title}.`);
        setStatus(outcome === "shared" ? "Share sheet band hui. File check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "Is browser mein file share available nahi; PDF download ho gayi.");
      }
    } catch (error) { setStatus(`Report export nahi ho saki: ${friendlyError(error)}`); }
    finally { setBusy(null); }
  };

  const exportTable = async (kind: "csv" | "excel") => {
    if (busy || matchingRows.length === 0) return;
    setBusy(kind);
    setStatus("");
    try {
      const filename = `${title === "Customer Report" ? "customer-report" : "khata-summary"}-${from}-to-${to}`;
      const exportData = exportRows(matchingRows);
      if (kind === "csv") {
        downloadFile(`${filename}.csv`, toCsv(columns, exportData, title), "text/csv;charset=utf-8");
        setStatus("CSV file download ho gayi.");
      } else {
        const bytes = await buildXlsx(title, columns, exportData);
        downloadBlob(`${filename}.xlsx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        setStatus("Excel file download ho gayi.");
      }
    } catch (error) { setStatus(`Report export nahi ho saki: ${friendlyError(error)}`); }
    finally { setBusy(null); }
  };

  const table = (tableRows: KhataPeriodCustomer[]) => <div className="overflow-x-auto">
    <table className="w-full min-w-[1180px] text-sm">
      <thead><tr>{["Customer", "Doodh", "Charges", "Wusooli", "Riayat", "Advance wapas", "Shuru", "Is muddat ka opening", "Aakhir"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
      <tbody>{tableRows.map((row) => <tr key={row.customer_id}>
        <td className="border-b border-line px-2 py-2"><a className="font-semibold text-berseem underline" href={`/reports/customer/?id=${encodeURIComponent(row.customer_id)}&from=${from}&to=${to}`}>{row.name}</a>{!row.active && <span className="ml-1 text-muted">(Band)</span>}</td>
        <td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_balance)}</td>
        <td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_added)}</td>
        <td className="border-b border-line px-2 py-2 text-right font-bold">{rs(row.closing_balance)}</td>
      </tr>)}</tbody>
      <tfoot><tr className="font-bold">
        <td className="border-t-2 border-ink px-2 py-2">Filter total</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{litres(matchingTotals.litres)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.charges)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.payments)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.discounts)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.refunds)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.opening)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.openingAdded)}</td>
        <td className="border-t-2 border-ink px-2 py-2 text-right">{rs(matchingTotals.closing)}</td>
      </tr></tfoot>
    </table>
  </div>;

  return <>
    <div className="no-print"><PageHeader title={title} sub="Sab customers ka baqaya aur wusooli ek jagah" back="/reports/" /></div>
    <Body className="print-report space-y-4 pb-8">
      <Panel title="Report ki tareekh" className="no-print">
        <div className="flex flex-wrap gap-2">{(["day", "yesterday", "week", "month", "year", "all", "custom"] as const).map((key) => <button type="button" key={key} onClick={() => choose(key)} className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === key ? "border-ink bg-ink text-white" : "border-line"}`}>{dateLabel(key)}</button>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Shuru ki tareekh<input aria-label="Khata summary shuru ki tareekh" type="date" value={from} max={to || today} onChange={(event) => { setPreset("custom"); setPage(1); setFrom(event.target.value); }} className={`${field} mt-1`} /></label>
          <label className="text-sm font-semibold">Aakhir ki tareekh<input aria-label="Khata summary aakhir ki tareekh" type="date" value={to} min={from} max={today} onChange={(event) => { setPreset("custom"); setPage(1); setTo(event.target.value); }} className={`${field} mt-1`} /></label>
        </div>
        {!valid && <p role="alert" className="mt-2 text-sm text-udhaar">Aaj tak ki sahi shuru aur aakhir ki tareekh chunein.</p>}
      </Panel>

      {summary.isPending && <p role="status">Khata summary load ho rahi hai…</p>}
      {summary.isError && <p role="alert" className="text-udhaar">Khata summary nahi khuli: {friendlyError(summary.error)} <button type="button" onClick={() => void summary.refetch()} className="underline">Dobara koshish</button></p>}
      {summary.data && <>
        <Panel title={`${from} se ${to} ka grand total — tamam customers`}>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["Kul doodh", litres(grand.litres)], ["Charges", rs(grand.charges)], ["Wusooli", rs(grand.payments)], ["Riayat", rs(grand.discounts)], ["Advance wapas", rs(grand.refunds)], ["Shuru ka baqaya", rs(grand.opening)], ["Is muddat ka opening balance", rs(grand.openingAdded)], ["Aakhir ka baqaya", rs(grand.closing)]].map(([label, value]) => <div className="rounded-xl bg-ground p-3" key={String(label)}><dt className="text-sm text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
        </Panel>

        <Panel title={`Customer-wise Khata — ${matchingRows.length} mein se ${rows.length}`} className="print-report">
          <div className="no-print mb-3 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_14rem_auto]">
            <label className="text-sm font-semibold">Customer ka naam talash karein<input aria-label="Customer summary search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${field} mt-1`} placeholder="Naam likhein" /></label>
            <label className="text-sm font-semibold">Tarteeb<select aria-label="Customer summary sort" value={sortKey} onChange={(event) => { setSortKey(event.target.value as KhataCustomerSortKey); setPage(1); }} className={`${field} mt-1`}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <button type="button" aria-label={direction === "asc" ? "Ulti tarteeb lagayein" : "Seedhi tarteeb lagayein"} onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")} className="min-h-11 self-end rounded-xl border border-line px-3 font-semibold">{sortKey === "name" ? (direction === "asc" ? "A–Z" : "Z–A") : direction === "asc" ? "Chhota pehle" : "Bara pehle"}</button>
          </div>

          <div className="no-print">{table(visibleRows)}</div>
          <div className="hidden print:block">{table(matchingRows)}</div>
          {!rows.length && <p className="mt-3 text-sm text-muted">Is muddat mein koi customer baqaya ya record nahi hai.</p>}
          {rows.length > 0 && !matchingRows.length && <p className="mt-3 text-sm text-muted">Is naam ke mutabiq koi customer nahi mila.</p>}
          <p className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted"><span>Inactive customers ki muddat wali report:</span><Link href="/reports/customer/inactive/" className="min-h-11 inline-flex items-center font-semibold text-berseem underline">Inactive Customers kholein →</Link></p>

          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-muted">Safha {currentPage} / {pageCount} · {matchingRows.length} customers</p>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Pichla safha</button>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="min-h-11 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Agla safha</button>
            </div>
          </div>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null || !matchingRows.length} onClick={() => void exportTable("csv")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">CSV download</button>
            <button type="button" disabled={busy !== null || !matchingRows.length} onClick={() => void exportTable("excel")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Excel download</button>
            <button type="button" disabled={busy !== null || !settings.data} onClick={() => void exportPdf("pdf")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button>
            <button type="button" disabled={busy !== null || !settings.data} onClick={() => void exportPdf("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button>
            <button type="button" disabled={busy !== null} onClick={() => void exportPdf("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold">Print</button>
          </div>
          {status && <p role={status.startsWith("Report export") ? "alert" : "status"} className="no-print mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>

        {preset === "year" && <Panel title="Maheena ba maheena — tamam customers">
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr>{["Maheena", "Doodh", "Charges", "Wusooli", "Riayat", "Advance wapas", "Aakhir ka baqaya"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{(yearly.data ?? []).map((row) => <tr key={row.month_start}><td className="border-b border-line px-2 py-2">{row.month_start}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{rs(row.closing_balance)}</td></tr>)}</tbody>
          </table></div>
          {yearly.isPending && <p role="status" className="mt-2 text-sm text-muted">Saal ka khulasa load ho raha hai…</p>}
          {yearly.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Saal ka khulasa nahi khula: {friendlyError(yearly.error)} <button type="button" onClick={() => void yearly.refetch()} className="underline">Dobara koshish</button></p>}
        </Panel>}
      </>}
    </Body>
  </>;
}
