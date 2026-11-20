"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import ReportPeriodPicker, { type ReportPeriodPreset } from "./ReportPeriodPicker";
import { buildPdfReport, downloadBlob, type PdfSection } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { litres, parseLitres, rs } from "@/lib/format";
import { addDays, todayPK } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { isReportDateRange, loadMilkReportBounds, loadMilkReportCustomers, loadMilkReportDaily, loadMilkReportDistributionDaily, loadMilkReportDistributionShifts, loadMilkReportDistributionTotals, saveMilkDayWaste, type MilkReportDistributionDetail } from "@/lib/reporting";
import { sharePdfFile } from "@/lib/pdf-share";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

const kindLabel = (kind: string) => kind === "free" ? "Muft" : kind === "company" ? "Company" : "Customer";
const dispositionLabel = (category: string) => ({
  employee: "Mulazim", friend: "Dost", guest: "Mehman", charity: "Khairat", other: "Doosra",
  owner_home: "Ghar / khandan", farm_use: "Farm ka istemal", spillage: "Gir gaya / spill", spoiled: "Kharab hua",
  legacy_free: "Purana muft record",
}[category] ?? category);
const detailsLabel = (details: MilkReportDistributionDetail[]) => details.map((detail) => [
  dispositionLabel(detail.category), detail.recipient, detail.note, `${litres(detail.litres)}`,
].filter(Boolean).join(" · ")).join("; ");

export default function MilkReport() {
  const today = todayPK();
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [wasteDate, setWasteDate] = useState(today);
  const [wasteForm, setWasteForm] = useState<{ date: string; litres: string; reason: string } | null>(null);
  const [wasteBusy, setWasteBusy] = useState(false);
  const savePending = useRef(false);
  const [wasteStatus, setWasteStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const valid = isReportDateRange(from, to, today);

  const bounds = useQuery({ queryKey: ["milk-report-date-bounds"], queryFn: loadMilkReportBounds, staleTime: 60_000 });
  const report = useQuery({
    queryKey: ["milk-report", from, to], enabled: valid,
    queryFn: async () => {
      const [daily, shifts, customers, totals] = await Promise.all([
        loadMilkReportDistributionDaily(from, to), loadMilkReportDistributionShifts(from, to),
        loadMilkReportCustomers(from, to), loadMilkReportDistributionTotals(from, to),
      ]);
      return { daily, shifts, customers, totals };
    },
  });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings });
  const validWasteDate = isReportDateRange(wasteDate, wasteDate, today);
  const wasteQuery = useQuery({
    queryKey: ["milk-report-waste", wasteDate], enabled: validWasteDate,
    queryFn: async () => (await loadMilkReportDaily(wasteDate, wasteDate))[0],
  });
  const wasteLitres = wasteForm?.date === wasteDate ? wasteForm.litres : String(wasteQuery.data?.day_wasted_litres ?? 0);
  const wasteReason = wasteForm?.date === wasteDate ? wasteForm.reason : wasteQuery.data?.day_waste_reason ?? "";

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

  const onWasteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savePending.current || !validWasteDate) return;
    try {
      const amount = wasteLitres.trim() ? parseLitres(wasteLitres) : 0;
      if (amount > 5000) throw new RangeError("Zaya doodh 5,000 L se zyada nahi ho sakta.");
      if (amount > 0 && wasteReason.trim().length < 3) throw new RangeError("Zaya doodh ki kam az kam 3 harf ki wajah likhein.");
      if (wasteReason.trim().length > 500) throw new RangeError("Wajah 500 harf se lambi nahi ho sakti.");
      savePending.current = true;
      setWasteBusy(true);
      setWasteStatus("Entry save ho rahi hai…");
      await saveMilkDayWaste(wasteDate, amount, wasteReason.trim());
      await queryClient.invalidateQueries({ queryKey: ["milk-report"] });
      await wasteQuery.refetch();
      setWasteForm(null);
      setWasteStatus(amount > 0 ? "Zaya doodh save ho gaya. Closing balance dobara calculate ho gaya." : "Waste entry hata di. Closing balance dobara calculate ho gaya.");
    } catch (error) { setWasteStatus(`Entry save nahi hui: ${friendlyError(error)}`); }
    finally { savePending.current = false; setWasteBusy(false); }
  };

  const exportPdf = async (action: "download" | "share" | "print") => {
    if (pdfBusy || !report.data || (action !== "print" && !settings.data)) return;
    setPdfStatus("");
    if (action === "print") { window.print(); setPdfStatus("Print dialog khul gaya."); return; }
    setPdfBusy(true);
    try {
      const { daily, shifts, customers, totals } = report.data;
      const summaryRows = [
        ["Selected muddat", `${from} se ${to}`], ["PDF tayyar ki tareekh", today],
        ["Pichla doodh balance", litres(totals.opening_litres)], ["Naya paida hua doodh", litres(totals.produced_litres)],
        ["Kul available doodh", litres(totals.available_litres)], ["Khata sale", litres(totals.khata_litres)],
        ["Cash sale", litres(totals.cash_litres)], ["Muft / diya", litres(totals.free_litres)],
        ["Ghar / farm use", litres(totals.farm_use_litres)], ["Zaya doodh", litres(totals.wasted_litres)],
        ["Kul allocated", litres(totals.allocated_litres)], ["Aakhir ka doodh balance", litres(totals.closing_litres)],
        ["Khata delivery", rs(totals.khata_delivery_amount)], ["Company bill", rs(totals.company_bill_amount)],
        ["Khata billed", rs(totals.khata_amount)], ["Cash sale amount", rs(totals.cash_sale_amount)],
        ["Kul milk sales", rs(totals.total_sales_amount)], ["Muddat mein wasool hui raqam", rs(totals.cash_received)],
        ["Cash sale se Galla mein", rs(totals.galla_cash_received)], ["Aakhir Khata baqaya", rs(totals.outstanding_khata_amount)],
      ].map(([item, value]) => ({ item, value }));
      const dailyRows = daily.map((row) => ({
        report_date: row.report_date, opening_litres: litres(row.opening_litres), produced_litres: litres(row.produced_litres), available_litres: litres(row.available_litres),
        khata_litres: litres(row.khata_litres), cash_litres: litres(row.cash_litres), free_litres: litres(row.free_litres),
        farm_use_litres: litres(row.farm_use_litres), wasted_litres: litres(row.wasted_litres), allocated_litres: litres(row.allocated_litres), remaining_litres: litres(row.remaining_litres),
        khata_delivery_amount: rs(row.khata_delivery_amount), company_bill_amount: rs(row.company_bill_amount),
        khata_amount: rs(row.khata_amount), cash_sale_amount: rs(row.cash_sale_amount), total_sales_amount: rs(row.total_sales_amount),
        cash_received: rs(row.cash_received), galla_cash_received: rs(row.galla_cash_received),
        free_details: detailsLabel(row.free_details), farm_use_details: detailsLabel(row.farm_use_details), waste_details: detailsLabel(row.waste_details),
      }));
      const shiftRows = shifts.map((row) => ({
        report_date: row.report_date, milk_shift: row.milk_shift, produced_litres: litres(row.produced_litres),
        khata_litres: litres(row.khata_litres), cash_litres: litres(row.cash_litres), free_litres: litres(row.free_litres),
        farm_use_litres: litres(row.farm_use_litres), wasted_litres: litres(row.wasted_litres),
        allocated_litres: litres(row.allocated_litres), remaining_litres: litres(row.remaining_litres),
        khata_delivery_amount: rs(row.khata_delivery_amount), cash_sale_amount: rs(row.cash_sale_amount),
        cash_received: rs(row.cash_received), galla_cash_received: rs(row.galla_cash_received),
        free_details: detailsLabel(row.free_details), farm_use_details: detailsLabel(row.farm_use_details), waste_details: detailsLabel(row.waste_details),
      }));
      const customerRows = customers.map((row) => ({
        name: row.name, kind: kindLabel(row.kind), litres: litres(row.litres), charged: rs(row.charged),
        paid: rs(row.paid), outstanding: rs(row.outstanding),
      }));
      const sections: PdfSection[] = [
        { title: "Grand summary", columns: ["item", "value"], rows: summaryRows },
        { title: "Daily milk distribution and collections", columns: ["report_date", "opening_litres", "produced_litres", "available_litres", "khata_litres", "cash_litres", "free_litres", "farm_use_litres", "wasted_litres", "allocated_litres", "remaining_litres", "khata_delivery_amount", "company_bill_amount", "khata_amount", "cash_sale_amount", "total_sales_amount", "cash_received", "galla_cash_received", "free_details", "farm_use_details", "waste_details"], rows: dailyRows, repeatColumns: ["report_date"] },
        { title: "Shift distribution and collections", columns: ["report_date", "milk_shift", "produced_litres", "khata_litres", "cash_litres", "free_litres", "farm_use_litres", "wasted_litres", "allocated_litres", "remaining_litres", "khata_delivery_amount", "cash_sale_amount", "cash_received", "galla_cash_received", "free_details", "farm_use_details", "waste_details"], rows: shiftRows, repeatColumns: ["report_date", "milk_shift"] },
        { title: "Customer sales and outstanding", columns: ["name", "kind", "litres", "charged", "paid", "outstanding"], rows: customerRows },
      ];
      const bytes = await buildPdfReport(`Milk Report — ${from} se ${to}`, sections, settings.data!.farm_name);
      const filename = `milk-report-${from}-to-${to}.pdf`;
      if (action === "download") {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setPdfStatus("Milk Report PDF download ho gayi.");
      } else {
        const outcome = await sharePdfFile(filename, bytes, `${settings.data!.farm_name} Milk Report`, `${from} se ${to} ka Milk Report.`);
        setPdfStatus(outcome === "shared" ? "Share sheet khul gayi. File aur recipient check karke Send karein." : outcome === "cancelled" ? "Share cancel ho gaya." : "File share dastiyab nahi thi; PDF download ho gayi.");
      }
    } catch (error) { setPdfStatus(`PDF nahi bani: ${friendlyError(error)}`); }
    finally { setPdfBusy(false); }
  };

  const data = report.data;
  return <>
    <PageHeader title="Milk Report" sub="Doodh ka rozana hisaab, customers aur baqaya" back="/reports/" />
    <Body className="print-report space-y-4 pb-8">
      <ReportPeriodPicker label="Milk Report" today={today} allFrom={bounds.data?.first_date || today} from={from} to={to} preset={preset} allDisabled={!bounds.data} allDisabledHint={bounds.isPending ? "Sab records ki pehli tareekh load ho rahi hai…" : bounds.isError ? "Sab records dikhane ke liye pehli tareekh load karein." : undefined} onRange={setRange} onPreset={choosePreset} />
      <p className="no-print text-sm"><Link className="font-semibold text-berseem underline" href="/reports/animal/">Animal-wise Milk Report kholein</Link></p>
      {bounds.isError && <p role="alert" className="text-sm text-udhaar">Report ki pehli tareekh nahi mili: {friendlyError(bounds.error)} <button type="button" onClick={() => void bounds.refetch()} className="underline">Dobara koshish</button></p>}
      {!valid && <p role="alert" className="text-sm text-udhaar">Aaj tak ki sahi tareekh chunein. Report ek dafa mein das saal tak dikhata hai.</p>}
      {report.isPending && valid && <p role="status" className="text-sm text-muted">Milk Report load ho rahi hai…</p>}
      {report.isError && <p role="alert" className="text-sm text-udhaar">Milk Report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {data && <>
        {!data.daily.some((row) => row.produced_litres || row.khata_litres || row.cash_litres || row.free_litres || row.farm_use_litres || row.wasted_litres) && !data.customers.some((row) => row.litres || row.charged || row.paid || row.outstanding) && <Panel title="Koi record nahi"><p className="text-sm text-muted">Chuni hui muddat mein doodh ki production, delivery ya customer ka baqaya record nahi hai.</p></Panel>}
        <Panel title="Rozana doodh ki taqseem aur wasooli">
          <p className="mb-3 text-sm text-muted">Milk Entry ke saved records se. Bacha hua doodh aglay din ke opening balance mein shamil hai. Khata billed mein delivery charges aur company bills shamil hain; kul sales mein cash sale bhi shamil hai. Wasooli asal payment date par aur Galla usi wasooli ka cash-sale hissa hai.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[1900px] text-sm"><thead><tr>{["Tareekh", "Pichla balance", "Naya doodh", "Kul available", "Khata (L)", "Cash (L)", "Muft (L)", "Ghar / farm (L)", "Zaya (L)", "Allocated (L)", "Bacha (L)", "Khata delivery", "Company bill", "Khata billed", "Cash sale", "Kul sales", "Wasool", "Galla mein"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{data.daily.map((row) => <tr key={row.report_date}>
              <td className="border-b border-line px-2 py-2">{row.report_date}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.opening_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.produced_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.available_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.khata_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.cash_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.free_litres)}{row.free_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.free_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.farm_use_litres)}{row.farm_use_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.farm_use_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.wasted_litres)}{row.waste_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.waste_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.allocated_litres)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{litres(row.remaining_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.khata_delivery_amount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.company_bill_amount)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.khata_amount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_sale_amount)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.total_sales_amount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_received)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.galla_cash_received)}</td>
            </tr>)}</tbody>
          </table></div>
        </Panel>
        <Panel title="Shift-wise milk distribution">
          <p className="mb-3 text-sm text-muted">Yahan sirf saved Subah, Dopehr aur Shaam shifts hain. Company bills shift se link nahi hotay, is liye woh daily aur grand Khata total mein hain. Shift ki wasooli usi din ki cash sale payment dikhati hai; baad ki collections unki asal tareekh ke daily total mein hain.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-sm"><thead><tr>{["Tareekh", "Shift", "Naya doodh", "Khata (L)", "Cash (L)", "Muft (L)", "Ghar / farm (L)", "Zaya (L)", "Allocated (L)", "Shift se bacha (L)", "Khata delivery amount", "Cash sale", "Cash wasool", "Galla mein"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{data.shifts.map((row) => <tr key={`${row.report_date}-${row.milk_shift}`}>
              <td className="border-b border-line px-2 py-2">{row.report_date}</td><td className="border-b border-line px-2 py-2">{row.milk_shift}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.produced_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.khata_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.cash_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.free_litres)}{row.free_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.free_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.farm_use_litres)}{row.farm_use_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.farm_use_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.wasted_litres)}{row.waste_details.length > 0 && <span className="block max-w-40 text-left text-xs text-muted">{detailsLabel(row.waste_details)}</span>}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.allocated_litres)}</td><td className="border-b border-line px-2 py-2 text-right font-bold">{litres(row.remaining_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.khata_delivery_amount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_sale_amount)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_received)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.galla_cash_received)}</td>
            </tr>)}</tbody></table></div>
          {!data.shifts.length && <p className="mt-3 text-sm text-muted">Is muddat mein koi saved milk shift nahi hai.</p>}
        </Panel>
        <Panel title="Customer-wise sales aur baqaya">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Customer", "Qism", "Doodh", "Kul raqam", "Wusooli", "Aakhir baqaya"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{data.customers.map((row) => <tr key={row.customer_id}>
              <td className="border-b border-line px-2 py-2"><Link className="font-semibold text-berseem underline" href={`/reports/customer/?id=${row.customer_id}&from=${from}&to=${to}`}>{row.name}</Link></td>
              <td className="border-b border-line px-2 py-2 text-right">{kindLabel(row.kind)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.charged)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.paid)}</td>
              <td className="border-b border-line px-2 py-2 text-right font-bold">{rs(row.outstanding)}</td>
            </tr>)}</tbody></table></div>
            {!data.customers.length && <p className="mt-3 text-sm text-muted">Is muddat mein koi customer report row nahi hai.</p>}
        </Panel>
        <Panel title={`${from} se ${to} ka grand summary`}>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Pichla doodh balance", litres(data.totals.opening_litres)], ["Naya paida hua doodh", litres(data.totals.produced_litres)],
              ["Kul available doodh", litres(data.totals.available_litres)], ["Khata sale", litres(data.totals.khata_litres)],
              ["Cash sale", litres(data.totals.cash_litres)], ["Muft / diya", litres(data.totals.free_litres)],
              ["Ghar / farm mein istemal", litres(data.totals.farm_use_litres)], ["Doodh zaya", litres(data.totals.wasted_litres)],
              ["Kul allocated", litres(data.totals.allocated_litres)], ["Aakhir ka doodh balance", litres(data.totals.closing_litres)],
              ["Khata delivery", rs(data.totals.khata_delivery_amount)], ["Company bill", rs(data.totals.company_bill_amount)],
              ["Khata billed", rs(data.totals.khata_amount)], ["Cash sale amount", rs(data.totals.cash_sale_amount)],
              ["Kul milk sales", rs(data.totals.total_sales_amount)], ["Muddat mein wasool hui raqam", rs(data.totals.cash_received)],
              ["Cash sale se Galla mein", rs(data.totals.galla_cash_received)], ["Aakhir Khata baqaya", rs(data.totals.outstanding_khata_amount)],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}
          </dl>
        </Panel>
        <Panel title="Shift ke baghair waste record" className="no-print">
          <p className="mb-3 text-sm text-muted">Yahan sirf woh waste darj karein jo Doodh entry mein kisi shift ke saath record nahi hua. Shift ka waste report mein khud shamil hai. Yeh entry aglay dinon ka closing balance dobara calculate karti hai. Wajah 3 se 500 harf tak likhein.</p>
          {wasteQuery.isError && <p role="alert" className="mb-2 text-sm text-udhaar">Is din ki waste entry nahi khuli: {friendlyError(wasteQuery.error)} <button type="button" onClick={() => void wasteQuery.refetch()} className="underline">Dobara koshish</button></p>}
          <form noValidate onSubmit={(event) => void onWasteSubmit(event)} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Waste ki tareekh<input aria-label="Waste ki tareekh" type="date" value={wasteDate} max={today} onChange={(event) => { setWasteDate(event.target.value); setWasteStatus(""); }} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold">Shift ke baghair waste (L)<input aria-label="Shift ke baghair waste litre" type="number" min="0" max="5000" step="0.01" inputMode="decimal" value={wasteLitres} onChange={(event) => setWasteForm({ date: wasteDate, litres: event.target.value, reason: wasteReason })} disabled={wasteQuery.isPending} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold sm:col-span-2">Waste ki wajah<textarea aria-label="Waste ki wajah" rows={2} maxLength={500} value={wasteReason} onChange={(event) => setWasteForm({ date: wasteDate, litres: wasteLitres, reason: event.target.value })} disabled={wasteQuery.isPending} className={`${field} mt-1 py-2`} placeholder="Misal: balti gir gayi" /></label>
            {wasteQuery.data && <p className="text-sm text-muted sm:col-span-2">Is din total available {litres(wasteQuery.data.available_litres)} · waste ke baad closing {litres(wasteQuery.data.closing_litres)}.</p>}
            {!validWasteDate && <p role="alert" className="text-sm text-udhaar sm:col-span-2">Aaj tak ki sahi tareekh chunein.</p>}
            <div className="sm:col-span-2"><button type="submit" disabled={wasteBusy || wasteQuery.isPending || !validWasteDate} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">{wasteBusy ? "Save ho raha hai…" : "Waste save karein"}</button>
              {wasteStatus && <p role={wasteStatus.startsWith("Entry save nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{wasteStatus}</p>}</div>
          </form>
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
