"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import ReportPeriodPicker, { type ReportPeriodPreset } from "./ReportPeriodPicker";
import { buildPdfReport, downloadBlob, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { litres } from "@/lib/format";
import { addDays, todayPK } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { isReportDateRange, loadMilkReportAnimalOptions, loadMilkReportAnimalSummary, loadMilkReportAnimals, loadMilkReportBounds } from "@/lib/reporting";
import { sharePdfFile } from "@/lib/pdf-share";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

export default function AnimalMilkReport() {
  const today = todayPK();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [animalId, setAnimalId] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const valid = isReportDateRange(from, to, today);

  const options = useQuery({ queryKey: ["milk-report-animal-options"], queryFn: loadMilkReportAnimalOptions, staleTime: 60_000 });
  const bounds = useQuery({ queryKey: ["milk-report-date-bounds"], queryFn: loadMilkReportBounds, staleTime: 60_000 });
  const report = useQuery({
    queryKey: ["milk-animal-report", from, to, animalId], enabled: valid,
    queryFn: async () => {
      const selected = animalId || null;
      const [daily, summary] = await Promise.all([
        loadMilkReportAnimals(from, to, selected), loadMilkReportAnimalSummary(from, to, selected),
      ]);
      return { daily, summary };
    },
  });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });

  const choosePreset = (value: ReportPeriodPreset) => {
    setPreset(value);
    setPdfStatus("");
    if (value === "today") { setFrom(today); setTo(today); }
    if (value === "day") { const day = to || today; setFrom(day); setTo(day); }
    if (value === "week") { setFrom(addDays(today, -6)); setTo(today); }
    if (value === "month") { setFrom(`${today.slice(0, 7)}-01`); setTo(today); }
    if (value === "year") { setFrom(`${today.slice(0, 4)}-01-01`); setTo(today); }
    if (value === "all") { setFrom(bounds.data?.first_date || today); setTo(today); }
  };
  const setRange = (start: string, end: string) => { setFrom(start); setTo(end); };

  const exportPdf = async (action: "download" | "share" | "print") => {
    if (pdfBusy || !report.data || (action !== "print" && !settings.data)) return;
    setPdfStatus("");
    if (action === "print") { window.print(); setPdfStatus("Print dialog khul gaya."); return; }
    setPdfBusy(true);
    try {
      const summary = report.data.summary;
      const selected = options.data?.find((animal) => animal.id === animalId);
      const title = selected ? `Animal Milk Report — ${selected.tag} — ${from} se ${to}` : `All Animals Milk Report — ${from} se ${to}`;
      const summaryRows = [
        { item: "Selected muddat", value: `${from} se ${to}` },
        { item: "PDF tayyar ki tareekh", value: today },
        ...summary.filter((row) => !row.is_grand_total || !animalId).map((row) => ({
          item: row.is_grand_total ? "Grand Total" : `${row.tag}${row.name ? ` · ${row.name}` : ""}`,
          value: `Subah ${litres(row.morning_litres)} · Dopehr ${litres(row.noon_litres)} · Shaam ${litres(row.evening_litres)} · Kul ${litres(row.total_litres)}`,
        })),
      ];
      const dailyRows = report.data.daily.map((row) => ({
        report_date: row.report_date, tag: row.tag, name: row.name,
        morning_litres: litres(row.morning_litres), noon_litres: litres(row.noon_litres),
        evening_litres: litres(row.evening_litres), total_litres: litres(row.total_litres),
      }));
      const detailColumns = ["report_date", "tag", "name", "morning_litres", "noon_litres", "evening_litres", "total_litres"];
      const sections: PdfSection[] = [
        { title: selected ? `Animal summary · ${selected.tag}` : "All animals summary", columns: ["item", "value"], rows: summaryRows },
        { title: selected ? "Daily production" : "Animal-wise daily production", columns: detailColumns, rows: dailyRows },
      ];
      const bytes = await buildPdfReport(title, sections, settings.data!.farm_name);
      const filename = `${selected ? `animal-${selected.tag}` : "all-animals"}-milk-${from}-to-${to}.pdf`;
      if (action === "download") {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setPdfStatus("Animal Milk Report PDF download ho gayi.");
      } else {
        const outcome = await sharePdfFile(filename, bytes, `${settings.data!.farm_name} Animal Milk Report`, `${from} se ${to} ka Animal Milk Report.`);
        setPdfStatus(outcome === "shared" ? "Share sheet khul gayi. File aur recipient check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "File share dastiyab nahi thi; PDF download ho gayi.");
      }
    } catch (error) { setPdfStatus(`PDF nahi bani: ${friendlyError(error)}`); }
    finally { setPdfBusy(false); }
  };

  const data = report.data;
  const grand = data?.summary.find((row) => row.is_grand_total);
  return <>
    <PageHeader title="Animal-wise Milk Report" sub="Tag ke mutabiq Subah, Dopehr aur Shaam ki production" back="/reports/" />
    <Body className="print-report space-y-4 pb-8">
      <p className="no-print text-sm"><Link className="font-semibold text-berseem underline" href="/reports/milk/">Customer / Overall Milk Report kholein</Link></p>
      <ReportPeriodPicker label="Animal Milk Report" today={today} allFrom={bounds.data?.first_date || today} from={from} to={to} preset={preset} allDisabled={!bounds.data} allDisabledHint={bounds.isPending ? "Sab records ki pehli tareekh load ho rahi hai…" : bounds.isError ? "Sab records dikhane ke liye pehli tareekh load karein." : undefined} onRange={setRange} onPreset={choosePreset} />
      {bounds.isError && <p role="alert" className="text-sm text-udhaar">Report ki pehli tareekh nahi mili: {friendlyError(bounds.error)} <button type="button" onClick={() => void bounds.refetch()} className="underline">Dobara koshish</button></p>}
      <Panel title="Janwar chunein" className="no-print">
        {options.isPending && <p role="status" className="text-sm text-muted">Janwar load ho rahe hain…</p>}
        {options.isError && <p role="alert" className="text-sm text-udhaar">Janwar ki list nahi khuli: {friendlyError(options.error)} <button type="button" onClick={() => void options.refetch()} className="underline">Dobara koshish</button></p>}
        <label className="block max-w-xl text-sm font-semibold">Tag Number
          <select aria-label="Janwar ka tag number" value={animalId} onChange={(event) => setAnimalId(event.target.value)} className={`${field} mt-1`}>
            <option value="">Sab janwar</option>
            {(options.data ?? []).map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}{animal.name ? ` · ${animal.name}` : ""}</option>)}
          </select>
        </label>
      </Panel>
      {!valid && <p role="alert" className="text-sm text-udhaar">Aaj tak ki sahi tareekh chunein. Report ek dafa mein das saal tak dikhata hai.</p>}
      {report.isPending && valid && <p role="status" className="text-sm text-muted">Animal Milk Report load ho rahi hai…</p>}
      {report.isError && <p role="alert" className="text-sm text-udhaar">Animal Milk Report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {data && <>
        <Panel title={animalId ? `${options.data?.find((row) => row.id === animalId)?.tag ?? "Janwar"} ka period summary` : "All animals ka grand summary"}>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[["Subah", litres(grand?.morning_litres ?? 0)], ["Dopehr", litres(grand?.noon_litres ?? 0)], ["Shaam", litres(grand?.evening_litres ?? 0)], ["Grand total", litres(grand?.total_litres ?? 0)]].map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}
          </dl>
          <p className="mt-2 text-sm text-muted">{animalId
            ? "Sirf is janwar ke saved per-animal entries shamil hain. Kul doodh mode ki entries ko kisi janwar mein taqseem nahi kiya gaya."
            : "Sab janwaron ke saved per-animal entries shamil hain. Kul doodh mode ki production kisi janwar mein taqseem nahi ki gayi."}</p>
        </Panel>
        {!data.daily.some((row) => row.total_litres > 0) && <Panel title="Koi production record nahi"><p className="text-sm text-muted">Chuni hui muddat mein is report ke liye per-animal doodh darj nahi hai.</p></Panel>}
        <Panel title={animalId ? "Rozana production" : "Janwar-wise totals"}>
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr>{["Tag Number", "Janwar", "Subah", "Dopehr", "Shaam", "Kul doodh", "Record walay din"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{data.summary.map((row) => <tr key={row.is_grand_total ? "grand-total" : row.animal_id} className={row.is_grand_total ? "bg-ground font-bold" : ""}><td className="border-b border-line px-2 py-2">{row.tag}</td><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.morning_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.noon_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.evening_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.total_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{row.recorded_days}</td></tr>)}</tbody>
          </table></div>
        </Panel>
        <Panel title={animalId ? "Tareekh ba tareekh shifts" : "All animals ki tareekh-wise production"}>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Tareekh", "Tag Number", "Janwar", "Subah", "Dopehr", "Shaam", "Kul"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{data.daily.map((row, index) => <tr key={`${row.animal_id}-${row.report_date}-${index}`}><td className="border-b border-line px-2 py-2">{row.report_date}</td><td className="border-b border-line px-2 py-2">{row.tag}</td><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.morning_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.noon_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.evening_litres)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{litres(row.total_litres)}</td></tr>)}</tbody>
          </table></div>
        </Panel>
        <Panel title="PDF aur print" className="no-print">
          {settings.isPending && <p role="status" className="mb-2 text-sm text-muted">PDF ke liye farm ki tafseel load ho rahi hai…</p>}
          {settings.isError && <p role="alert" className="mb-2 text-sm text-udhaar">Farm ki tafseel nahi mili: {friendlyError(settings.error)} <button type="button" onClick={() => void settings.refetch()} className="underline">Dobara koshish</button></p>}
          <div className="flex flex-wrap gap-2"><button type="button" disabled={pdfBusy || !settings.data} onClick={() => void exportPdf("download")} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">PDF download</button>
            <button type="button" disabled={pdfBusy || !settings.data} onClick={() => void exportPdf("share")} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button>
            <button type="button" disabled={pdfBusy} onClick={() => void exportPdf("print")} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Print</button></div>
          {pdfStatus && <p role={pdfStatus.startsWith("PDF nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{pdfStatus}</p>}
        </Panel>
      </>}
    </Body>
  </>;
}
