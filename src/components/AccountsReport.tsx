"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Body, PageHeader, Panel } from "@/components/ui";
import ReportPeriodPicker, { type ReportPeriodPreset } from "@/components/ReportPeriodPicker";
import { friendlyError } from "@/lib/errors";
import { monthStart, todayPK } from "@/lib/dates";
import { money, shortDate } from "@/lib/farm-data";
import { getSettings } from "@/lib/settings";
import { buildPdfReport, buildXlsx, downloadBlob, downloadFile, toCsv, type PdfSection } from "@/lib/export-data";
import {
  flattenOwnerReportRows, getAllOwnerTransferRows, getOwnerTransferBounds, getOwnerTransferRows,
  getOwnerTransferSummary, OWNER_TRANSFER_COLUMNS, type OwnerTransfer, type OwnerTransferSummary,
} from "@/lib/owner-account-report";

const pageSize = 50;
const reportColumns = [...OWNER_TRANSFER_COLUMNS];
const summaryColumns = ["total_withdrawals", "total_deposits", "net_amount", "withdrawal_count", "deposit_count"];
const exportColumns = [...summaryColumns, ...reportColumns];
const periodLabel = (from: string, to: string) => from === to ? from : `${from} se ${to}`;

function TransfersTable({ title, rows }: { title: string; rows: OwnerTransfer[] }) {
  return <Panel title={title}>
    {!rows.length ? <p className="text-sm text-muted">Is safhay par koi entry nahi.</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[690px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-line text-muted"><th className="p-2">Tareekh</th><th className="p-2">Maalik ka account</th><th className="p-2">Farm account</th><th className="p-2">Wajah / note</th><th className="p-2">Darj karne wala</th><th className="p-2 text-right">Raqam</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.transfer_id} className="border-b border-line align-top">
          <td className="p-2">{shortDate(row.transfer_date)}</td><td className="p-2">{row.owner_account_name}</td>
          <td className="p-2">{row.farm_account_name}</td><td className="max-w-64 whitespace-pre-wrap p-2">{row.note || "—"}</td>
          <td className="max-w-48 break-all p-2" title={row.recorded_by ?? undefined}>{row.recorded_by ? `User ID: ${row.recorded_by}` : "Darj nahi"}</td>
          <td className="whitespace-nowrap p-2 text-right font-semibold">{money(row.amount)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </Panel>;
}

function sectionsForPdf(from: string, to: string, summary: OwnerTransferSummary, rows: OwnerTransfer[]): PdfSection[] {
  return [
    { title: "Owner transactions ka khulasa", columns: ["item", "value"], rows: [
      { item: "Report ki muddat", value: periodLabel(from, to) },
      { item: "Kul owner deposits", value: money(summary.total_deposits) },
      { item: "Kul owner withdrawals", value: money(summary.total_withdrawals) },
      { item: "Net (deposits − withdrawals)", value: money(summary.net_amount) },
      { item: "Deposits ki tadaad", value: summary.deposit_count },
      { item: "Withdrawals ki tadaad", value: summary.withdrawal_count },
    ] },
    { title: "Owner withdrawals", columns: reportColumns, rows: rows.filter((row) => row.direction === "withdrawal").map((row) => ({ ...row, amount: money(row.amount), recorded_by: row.recorded_by ?? "Darj nahi" })) },
    { title: "Owner deposits", columns: reportColumns, rows: rows.filter((row) => row.direction === "deposit").map((row) => ({ ...row, amount: money(row.amount), recorded_by: row.recorded_by ?? "Darj nahi" })) },
  ];
}

export default function AccountsReport() {
  const today = todayPK();
  const [preset, setPreset] = useState<ReportPeriodPreset>("month");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const bounds = useQuery({ queryKey: ["owner-transfer-bounds"], queryFn: getOwnerTransferBounds });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to && to <= today;
  const summary = useQuery({ queryKey: ["owner-transfer-summary", from, to], queryFn: () => getOwnerTransferSummary(from, to), enabled: validRange });
  const rows = useQuery({ queryKey: ["owner-transfer-rows", from, to, page], queryFn: () => getOwnerTransferRows(from, to, pageSize, page * pageSize), enabled: validRange });

  const changeRange = (nextFrom: string, nextTo: string) => { setFrom(nextFrom); setTo(nextTo); setPage(0); setExportStatus(""); };
  const exportReport = async (format: "csv" | "xlsx" | "pdf") => {
    if (!validRange || !summary.data || exporting) return;
    setExporting(true); setExportStatus("");
    try {
      const allRows = await getAllOwnerTransferRows(from, to);
      const title = `Accounts Report — ${from} se ${to}`;
      const filename = `accounts-report-${from}-${to}`;
      if (format === "csv") {
        const flattened = flattenOwnerReportRows(summary.data, allRows);
        downloadFile(`${filename}.csv`, toCsv(exportColumns, flattened, "Owner transactions"), "text/csv;charset=utf-8");
      } else if (format === "xlsx") {
        const flattened = flattenOwnerReportRows(summary.data, allRows);
        downloadBlob(`${filename}.xlsx`, new Blob([await buildXlsx("Owner transactions", exportColumns, flattened)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
      } else {
        const bytes = await buildPdfReport(title, sectionsForPdf(from, to, summary.data, allRows), settings.data?.farm_name ?? "Dairy Farm");
        downloadBlob(`${filename}.pdf`, new Blob([bytes], { type: "application/pdf" }));
      }
      setExportStatus(`${format.toUpperCase()} file download ho gayi.`);
    } catch (error) { setExportStatus(`Export nahi hua: ${friendlyError(error)}`); }
    finally { setExporting(false); }
  };

  const visibleRows = rows.data ?? [];
  const withdrawals = visibleRows.filter((row) => row.direction === "withdrawal");
  const deposits = visibleRows.filter((row) => row.direction === "deposit");
  const totalRows = (summary.data?.withdrawal_count ?? 0) + (summary.data?.deposit_count ?? 0);
  const allFrom = bounds.data?.first_date || today;
  const rangeReady = validRange && !bounds.isError;

  return <>
    <PageHeader title="Accounts Report" sub="Maalik aur farm ke darmiyan jama aur nikli raqam" back="/reports/" />
    <Body className="grid gap-4 pb-8">
      <p className="text-sm text-muted">Yeh report sirf un transfers ko dikhati hai jo Farm Galla aur Settings mein wazeh taur par Maalik mark kiye gaye Person account ke darmiyan huay. Yeh raqam farm ki aamdani ya kharcha nahi hoti.</p>
      <ReportPeriodPicker label="Accounts Report" today={today} allFrom={allFrom} from={from} to={to} preset={preset}
        allDisabled={bounds.isPending || bounds.isError} allDisabledHint={bounds.isPending ? "Pehle purane owner transfers ki tareekh load ho rahi hai." : undefined}
        onRange={changeRange} onPreset={setPreset} />
      {bounds.isError && <p role="alert" className="text-udhaar">Report ki tareekh nahi khuli: {friendlyError(bounds.error)} <button onClick={() => void bounds.refetch()} className="underline">Dobara koshish</button></p>}
      {!validRange && <p role="alert" className="text-udhaar">Shuru aur aakhir ki tareekh check karein. Aakhir ki tareekh aaj se aage nahi ho sakti.</p>}
      {validRange && (summary.isPending || rows.isPending) && <p role="status" className="text-muted">Accounts Report load ho rahi hai…</p>}
      {(summary.isError || rows.isError) && <p role="alert" className="text-udhaar">Report nahi khuli: {friendlyError(summary.error ?? rows.error)} <button onClick={() => { void summary.refetch(); void rows.refetch(); }} className="underline">Dobara koshish</button></p>}
      {rangeReady && summary.data && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel title="Owner deposits"><strong className="block text-xl">{money(summary.data.total_deposits)}</strong><span className="text-sm text-muted">{summary.data.deposit_count} entries</span></Panel>
          <Panel title="Owner withdrawals"><strong className="block text-xl">{money(summary.data.total_withdrawals)}</strong><span className="text-sm text-muted">{summary.data.withdrawal_count} entries</span></Panel>
          <Panel title="Net raqam"><strong className={`block text-xl ${summary.data.net_amount < 0 ? "text-udhaar" : "text-berseem-deep"}`}>{money(summary.data.net_amount)}</strong><span className="text-sm text-muted">Deposits minus withdrawals</span></Panel>
          <Panel title="Kul entries"><strong className="block text-xl">{totalRows}</strong><span className="text-sm text-muted">{periodLabel(from, to)}</span></Panel>
        </div>
        <Panel title="Report export">
          <div className="flex flex-wrap gap-2">{(["pdf", "xlsx", "csv"] as const).map((format) => <button key={format} type="button" disabled={exporting || summary.isPending} onClick={() => void exportReport(format)} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">{exporting ? "File tayyar ho rahi hai…" : format === "xlsx" ? "Excel download" : `${format.toUpperCase()} download`}</button>)}</div>
          {exportStatus && <p role="status" className="mt-2 text-sm text-muted">{exportStatus}</p>}
        </Panel>
        {!totalRows && <Panel title="Koi owner transfer nahi"><p className="text-sm text-muted">Is muddat mein owner transfer nahi mila. Naya owner account Settings → Accounts mein bana kar explicitly mark karein; phir Galla se deposit ya withdrawal darj karein.</p><Link href="/settings/" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-berseem px-4 font-semibold text-berseem-deep">Settings kholein</Link></Panel>}
        {!!totalRows && <>
          <TransfersTable title={`Owner withdrawals · ${summary.data.withdrawal_count} kul`} rows={withdrawals} />
          <TransfersTable title={`Owner deposits · ${summary.data.deposit_count} kul`} rows={deposits} />
          <div className="flex items-center justify-between gap-3">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Pichla safha</button>
            <span aria-live="polite" className="text-sm text-muted">Safha {page + 1} · {Math.min(page * pageSize + visibleRows.length, totalRows)} / {totalRows}</span>
            <button type="button" disabled={(page + 1) * pageSize >= totalRows || visibleRows.length < pageSize} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Agla safha</button>
          </div>
        </>}
      </>}
    </Body>
  </>;
}
