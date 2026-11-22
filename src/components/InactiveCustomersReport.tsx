"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import { addDays, formatDay, todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { buildPdfReport, buildXlsx, downloadBlob, downloadFile, toCsv } from "@/lib/export-data";
import { getSettings } from "@/lib/settings";
import { loadInactiveCustomers } from "@/lib/reporting";
import { inactiveCustomerKindLabel, inactiveCustomerMatchesSearch } from "@/lib/inactive-customers";

const PAGE_SIZE = 25;
const columns = ["name", "phone", "kind"];
type SortKey = "name" | "kind";

export default function InactiveCustomersReport() {
  const today = todayPK();
  const [lookbackDays, setLookbackDays] = useState<30 | 60 | 90>(30);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"pdf" | "csv" | "excel" | "print" | null>(null);
  const [status, setStatus] = useState("");
  const from = addDays(today, 1 - lookbackDays);
  const report = useQuery({
    queryKey: ["inactive-customers", from, today],
    queryFn: () => loadInactiveCustomers(from, today),
  });
  const filteredRows = useMemo(() => {
    return (report.data ?? []).filter((row) => inactiveCustomerMatchesSearch(row, search))
      .slice().sort((left, right) => {
        const primary = left[sortKey].localeCompare(right[sortKey], undefined, { sensitivity: "base" });
        return (descending ? -primary : primary) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      });
  }, [descending, report.data, search, sortKey]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const exportReport = async (action: "pdf" | "csv" | "excel" | "print") => {
    if (busy || !filteredRows.length) return;
    setBusy(action);
    setStatus("");
    try {
      const filename = `inactive-customers-last-${lookbackDays}-days-${today}`;
      if (action === "print") {
        window.print();
        setStatus("Print ke liye report tayyar hai.");
      } else if (action === "csv") {
        downloadFile(`${filename}.csv`, toCsv(columns, filteredRows, "Inactive Customers"), "text/csv;charset=utf-8");
        setStatus("CSV file download ho gayi.");
      } else if (action === "excel") {
        const bytes = await buildXlsx("Inactive Customers", columns, filteredRows);
        downloadBlob(`${filename}.xlsx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        setStatus("Excel file download ho gayi.");
      } else {
        const settings = await getSettings();
        const bytes = await buildPdfReport(`Inactive Customers — ${from} to ${today}`, [
          { title: "Lookback", columns: ["item", "value"], rows: [
            { item: "No recorded milk sale or company bill", value: `${lookbackDays} days` },
            { item: "Date range", value: `${from} to ${today}` },
            { item: "Matching active customers", value: filteredRows.length },
          ] },
          { title: "Inactive customers", columns, rows: filteredRows },
        ], settings.farm_name);
        downloadBlob(`${filename}.pdf`, new Blob([bytes], { type: "application/pdf" }));
        setStatus("PDF download ho gayi.");
      }
    } catch (error) {
      setStatus(`Report export nahi ho saki: ${friendlyError(error)}`);
    } finally {
      setBusy(null);
    }
  };

  return <>
    <PageHeader title="Inactive Customers" sub="Aise active customers jinki chuni hui muddat mein milk sale ya company bill darj nahi." back="/reports/customer/" />
    <Body className="grid gap-4 pb-8">
      <Panel title="No-purchase lookback">
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)] sm:items-end">
          <label className="text-sm font-semibold">Pichli khareed ki muddat
            <select aria-label="No-purchase lookback" value={lookbackDays} onChange={(event) => {
              setLookbackDays(Number(event.target.value) as 30 | 60 | 90);
              setPage(1);
              setStatus("");
            }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3">
              <option value={30}>Aakhri 30 din</option>
              <option value={60}>Aakhri 60 din</option>
              <option value={90}>Aakhri 90 din</option>
            </select>
          </label>
          <p className="text-sm text-muted">Sales ki jaanch {formatDay(from)} se {formatDay(today)} tak hai. Payment akeli purchase nahi gini jati; muft customers list mein nahi aate.</p>
        </div>
      </Panel>

      <Panel title="Purchase ke baghair active customers" className="print-report">
        <div className="no-print mb-3 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_14rem_auto]">
          <label className="text-sm font-semibold">Naam, phone ya qism talash karein
            <input aria-label="Inactive customer search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3" placeholder="Naam likhein" />
          </label>
          <label className="text-sm font-semibold">Tarteeb
            <select aria-label="Inactive customer sort" value={sortKey} onChange={(event) => { setSortKey(event.target.value as SortKey); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3">
              <option value="name">Naam</option><option value="kind">Customer qism</option>
            </select>
          </label>
          <button type="button" aria-label={descending ? "Seedhi tarteeb lagayein" : "Ulti tarteeb lagayein"} onClick={() => setDescending((value) => !value)} className="min-h-11 self-end rounded-xl border border-line px-3 font-semibold">{descending ? "Z–A" : "A–Z"}</button>
        </div>

        {report.isPending && <p role="status">Inactive customers load ho rahe hain…</p>}
        {report.isError && <p role="alert">Customer report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
        {report.data && <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr>{["Customer", "Phone", "Qism"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left">{label}</th>)}</tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.customer_id}>
                <td className="border-b border-line px-2 py-2 font-semibold"><Link className="text-berseem underline" href={`/reports/customer/?id=${encodeURIComponent(row.customer_id)}&from=${from}&to=${today}`}>{row.name}</Link></td>
                <td className="border-b border-line px-2 py-2">{row.phone || "Phone darj nahi"}</td>
                <td className="border-b border-line px-2 py-2">{inactiveCustomerKindLabel(row.kind)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!filteredRows.length && <p className="mt-3 text-sm text-muted">{search.trim() ? "Is search se koi customer nahi mila." : "Is muddat mein koi inactive paying customer nahi mila."}</p>}
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-muted">{filteredRows.length} customers · Safha {currentPage} / {pageCount}</p>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Pichla safha</button>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="min-h-11 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Agla safha</button>
            </div>
          </div>
        </>}
        <div className="no-print mt-4 flex flex-wrap gap-2">
          {([ ["pdf", "PDF download"], ["csv", "CSV download"], ["excel", "Excel download"], ["print", "Print karein"] ] as const).map(([action, label]) => <button key={action} type="button" disabled={busy !== null || report.isPending || report.isError || !filteredRows.length} onClick={() => void exportReport(action)} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">{busy === action ? "Tayyar ho raha hai…" : label}</button>)}
        </div>
        {status && <p role={status.startsWith("Report export") ? "alert" : "status"} className="no-print mt-2 text-sm text-berseem-deep">{status}</p>}
      </Panel>
    </Body>
  </>;
}
