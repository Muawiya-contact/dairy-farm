"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Body, PageHeader, Panel } from "./ui";
import { ANIMAL_REPORTS, loadAnimalReport, type AnimalReportSection, type AnimalReportType } from "@/lib/animal-reports";
import { allRows, type Animal } from "@/lib/farm-data";
import { todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { buildPdfReport, columnLabel, displayCell, downloadBlob, type PdfSection } from "@/lib/export-data";
import { sharePdfFile } from "@/lib/pdf-share";
import { getSettings } from "@/lib/settings";
import { isReportDateRange } from "@/lib/reporting";
import { litres, rs } from "@/lib/format";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const dateReports: AnimalReportType[] = ["transactions", "milk", "yield", "health", "calvings"];
const speciesLockedReports: AnimalReportType[] = ["cows", "buffaloes"];
const pageSize = 50;

function formatReportValue(column: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (["total_litres", "morning_litres", "noon_litres", "evening_litres"].includes(column)) return litres(Number(value));
  if (["amount", "cost"].includes(column)) return rs(Number(value));
  if (column === "birth_weight_kg") return `${value} kg`;
  return displayCell(value);
}

function ReportTable({ section }: { section: AnimalReportSection }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(section.rows.length / pageSize));
  const rows = section.rows.slice(page * pageSize, (page + 1) * pageSize);
  const table = (tableRows: Record<string, unknown>[], label: string) => <div className="overflow-x-auto">
    <table aria-label={label} className="w-full min-w-[760px] text-sm">
      <thead><tr>{section.columns.map((column) => <th key={column} className="border-b border-line px-2 py-2 text-left">{columnLabel(column, section.title)}</th>)}</tr></thead>
      <tbody>{tableRows.map((row, index) => <tr key={`${String(row.calving_id ?? row.animal_id ?? row.tag ?? "row")}-${index}`}>
        {section.columns.map((column) => <td key={column} className="border-b border-line px-2 py-2 align-top">{formatReportValue(column, row[column])}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
  return <Panel title={section.title}>
    {section.rows.length === 0 ? <p className="text-sm text-muted">Is hissa mein chuni hui report ke mutabiq koi record nahi mila.</p> : <>
      <div className="no-print">{table(rows, `${section.title} (screen)`)}</div>
      <div className="hidden print:block">{table(section.rows, `${section.title} (print)`)}</div>
      {pageCount > 1 && <div className="no-print mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{section.rows.length.toLocaleString("en-IN")} records · Safha {page + 1} / {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-11 rounded-xl border border-line px-3 disabled:opacity-50">Pichla</button>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="min-h-11 rounded-xl border border-line px-3 disabled:opacity-50">Agla</button>
        </div>
      </div>}
    </>}
  </Panel>;
}

export default function AnimalReport() {
  const today = todayPK();
  const [type, setType] = useState<AnimalReportType>("inventory");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [animalId, setAnimalId] = useState("");
  const [species, setSpecies] = useState<"all" | "cow" | "buffalo">("all");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchQuery(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const animals = useQuery({ queryKey: ["animal-report-options"], queryFn: () => allRows<Animal>("animals", "tag"), staleTime: 60_000 });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });
  const hasDateFilter = dateReports.includes(type);
  const validRange = !hasDateFilter || isReportDateRange(from, to, today);
  const report = useQuery({
    queryKey: ["animal-report", type, from, to, animalId, species, searchQuery],
    enabled: !!animals.data && validRange,
    queryFn: () => loadAnimalReport(type, { from, to, animalId, species, search: searchQuery }, animals.data!),
  });
  const selected = ANIMAL_REPORTS.find((item) => item.id === type)!;
  const anyRows = report.data?.sections.some((item) => item.rows.length > 0) ?? false;

  const exportPdf = async (action: "download" | "share" | "print") => {
    if (!report.data || pdfBusy || (action !== "print" && !settings.data)) return;
    setPdfStatus("");
    if (action === "print") { window.print(); setPdfStatus("Print dialog khul gaya."); return; }
    setPdfBusy(true);
    try {
      const selectedAnimal = animals.data?.find((animal) => animal.id === animalId);
      const filterRows: { detail: string; value: string }[] = [
        { detail: "Report", value: selected.title },
        { detail: "PDF ki tareekh", value: today },
        { detail: "Janwar", value: selectedAnimal ? `${selectedAnimal.tag}${selectedAnimal.name ? ` · ${selectedAnimal.name}` : ""}` : "Tamam janwar" },
        { detail: "Janwar ki qism", value: type === "cows" ? "Gaye" : type === "buffaloes" ? "Bhains" : species === "all" ? "Tamam" : species === "cow" ? "Gaye" : "Bhains" },
        ...(hasDateFilter ? [{ detail: "Muddat", value: `${from} se ${to} tak, dono tareekhein shamil` }] : []),
        ...(searchQuery ? [{ detail: "Talash", value: searchQuery }] : []),
        ...(type === "milk" ? [{ detail: "Doodh ka daaira", value: "Sirf saved janwar-wise entries; total-only shifts ko kisi janwar mein taqseem nahi kiya." }] : []),
        ...(type === "yield" ? [{ detail: "Ranking ka daaira", value: "Sirf saved janwar-wise entries; total-only shifts shamil nahi. Record na hona zero paidawar nahi." }] : []),
      ];
      const sections: PdfSection[] = [
        { title: "Report ki tafseel", columns: ["detail", "value"], rows: filterRows },
        { title: "Report ka khulasa", columns: ["detail", "value"], rows: report.data.summary.map(({ label, value }) => ({ detail: label, value })) },
        ...report.data.sections.map((item) => ({ ...item, rows: item.rows.map((row) => Object.fromEntries(item.columns.map((column) => [column, formatReportValue(column, row[column])]))) })),
      ];
      const title = `${selected.title}${hasDateFilter ? ` — ${from} se ${to}` : ""}`;
      const bytes = await buildPdfReport(title, sections, settings.data!.farm_name);
      const filename = `animal-report-${type}${hasDateFilter ? `-${from}-to-${to}` : ""}.pdf`;
      if (action === "download") {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setPdfStatus("Animal Report PDF download ho gayi.");
      } else {
        const outcome = await sharePdfFile(filename, bytes, `${settings.data!.farm_name} · ${selected.title}`, title);
        setPdfStatus(outcome === "shared" ? "Share sheet khul gayi. File aur recipient dekh kar Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "PDF download ho gayi; ab aap ise share kar sakte hain.");
      }
    } catch (error) { setPdfStatus(`PDF nahi bani: ${friendlyError(error)}`); }
    finally { setPdfBusy(false); }
  };

  return <>
    <PageHeader title="Animal Report" sub="Janwaron ke saved records se report chunein." back="/reports/" />
    <Body className="print-report space-y-4 pb-8">
      <nav aria-label="Animal report types" className="no-print grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ANIMAL_REPORTS.map((item) => <button key={item.id} type="button" aria-pressed={type === item.id} onClick={() => { setType(item.id); setPdfStatus(""); }}
          className={`min-h-24 rounded-2xl border p-4 text-left transition-colors ${type === item.id ? "border-berseem bg-berseem-soft" : "border-line bg-paper hover:bg-ground"}`}>
          <span className="block font-display text-base font-bold">{item.title}</span><span className="mt-1 block text-sm text-muted">{item.description}</span>
        </button>)}
      </nav>

      <Panel title="Report chhantne ke options" className="no-print">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">Janwar
            <select aria-label="Animal report janwar" value={animalId} onChange={(event) => setAnimalId(event.target.value)} className={`${field} mt-1`}>
              <option value="">Tamam janwar</option>{(animals.data ?? []).map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}{animal.name ? ` · ${animal.name}` : ""}</option>)}
            </select>
          </label>
          {!speciesLockedReports.includes(type) && <label className="text-sm font-semibold">Janwar ki qism
            <select aria-label="Animal report species" value={species} onChange={(event) => setSpecies(event.target.value as typeof species)} className={`${field} mt-1`}>
              <option value="all">Tamam</option><option value="cow">Gaye</option><option value="buffalo">Bhains</option>
            </select>
          </label>}
          {hasDateFilter && <>
            <label className="text-sm font-semibold">Muddat shuru<input aria-label="Animal report start date" type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold">Muddat khatam<input aria-label="Animal report end date" type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} className={`${field} mt-1`} /></label>
          </>}
          <label className="text-sm font-semibold">Talash
            <input aria-label="Animal report search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tag ya naam" className={`${field} mt-1`} />
          </label>
        </div>
        {animals.isPending && <p role="status" className="mt-3 text-sm text-muted">Janwaron ki fehrist load ho rahi hai…</p>}
        {animals.isError && <p role="alert" className="mt-3 text-sm text-udhaar">Janwaron ki fehrist nahi mili: {friendlyError(animals.error)} <button type="button" onClick={() => void animals.refetch()} className="underline">Dobara koshish</button></p>}
        {hasDateFilter && !validRange && <p role="alert" className="mt-3 text-sm text-udhaar">Aaj tak ki sahi tareekh chunein. Report ki muddat 10 saal tak ho sakti hai.</p>}
        {search !== searchQuery && <p role="status" className="mt-3 text-sm text-muted">Talash apply ho rahi hai…</p>}
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{selected.title}</h2>
        <p className="text-sm text-muted">{hasDateFilter ? `${from} se ${to}` : "Maujooda aur tareekhi records"}</p>
      </div>
      {report.isPending && validRange && <p role="status" className="text-sm text-muted">Animal Report load ho rahi hai…</p>}
      {report.isError && <p role="alert" className="text-sm text-udhaar">Animal Report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {report.data && <>
        {!anyRows && <Panel title="Koi matching record nahi"><p className="text-sm text-muted">Is report aur chhantne ke options ke liye database mein koi record nahi mila. Khali report ka PDF bhi download ya share kiya ja sakta hai.</p></Panel>}
        {report.data.summary.length > 0 && <Panel title="Khulasa"><dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {report.data.summary.map((item) => <div key={item.label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{item.label}</dt><dd className="font-bold">{item.value}</dd></div>)}
        </dl></Panel>}
        {(type === "milk" || type === "yield") && <p className="text-sm text-muted">Sirf janwar-wise saved doodh entries shamil hain. Kul doodh mode ki shifts kisi janwar ko mansoob nahi hotin; record na hona zero paidawar nahi hai.</p>}
        {report.data.sections.map((item) => <ReportTable key={`${type}-${from}-${to}-${animalId}-${species}-${searchQuery}-${item.title}`} section={item} />)}
        {type === "milk" && <p className="no-print text-sm"><Link className="font-semibold text-berseem underline" href="/reports/animal/milk/">Shift-wise detailed animal milk report kholein</Link></p>}
        <Panel title="PDF aur print" className="no-print">
          {settings.isPending && <p role="status" className="mb-2 text-sm text-muted">PDF ke liye farm ki tafseel load ho rahi hai…</p>}
          {settings.isError && <p role="alert" className="mb-2 text-sm text-udhaar">Farm ki tafseel nahi mili: {friendlyError(settings.error)} <button type="button" onClick={() => void settings.refetch()} className="underline">Dobara koshish</button></p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pdfBusy || !settings.data || search !== searchQuery} onClick={() => void exportPdf("download")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button>
            <button type="button" disabled={pdfBusy || !settings.data || search !== searchQuery} onClick={() => void exportPdf("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button>
            <button type="button" disabled={pdfBusy || search !== searchQuery} onClick={() => void exportPdf("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Print</button>
          </div>
          {pdfStatus && <p role={pdfStatus.startsWith("PDF nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{pdfStatus}</p>}
        </Panel>
      </>}
    </Body>
  </>;
}
