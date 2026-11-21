"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import { formatDay, monthStart, todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { litres, rs } from "@/lib/format";
import { isReportDateRange } from "@/lib/reporting";
import {
  finalReportExportSections, finalReportRange, loadFinalReport, milkReconciliationVariance, milkShiftProduction,
  type FinalReportPreset,
} from "@/lib/final-report";
import { buildPdfReport, buildXlsx, downloadBlob, type PdfSection } from "@/lib/export-data";
import { flattenFinancialExport } from "@/lib/financial-report";
import { sharePdfFile } from "@/lib/pdf-share";

type ExportAction = "pdf" | "excel" | "print" | "share";
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const presets: { id: FinalReportPreset; label: string }[] = [
  { id: "month", label: "Yeh maheena" }, { id: "previous", label: "Pichla maheena" },
  { id: "year", label: "Yeh saal" }, { id: "custom", label: "Apni muddat" },
];
const periodText = (from: string, to: string) => `${formatDay(from)} se ${formatDay(to)} tak`;
const shiftNames = { morning: "Subah", noon: "Dopehr", evening: "Shaam" } as const;

function exportStatus(action: ExportAction, outcome?: "shared" | "cancelled" | "downloaded") {
  if (action === "print") return "Print dialog khul gaya.";
  if (action === "excel") return "Excel report download ho gayi.";
  if (outcome === "shared") return "Share menu khul gaya hai. Recipient aur file check karke Send karein.";
  if (outcome === "cancelled") return "Share cancel ho gaya.";
  if (action === "share") return "Is device par PDF share nahi ho saki; file download ho gayi.";
  return "PDF download ho gayi.";
}

export default function FinalReport() {
  const today = todayPK();
  const [preset, setPreset] = useState<FinalReportPreset>("month");
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [status, setStatus] = useState("");
  const validRange = isReportDateRange(from, to, today);
  const report = useQuery({
    queryKey: ["final-report", from, to], enabled: validRange,
    queryFn: () => loadFinalReport(from, to),
  });
  const data = validRange ? report.data : undefined;
  const financial = data?.financial;
  const summary = financial?.period.summary;
  const milk = data?.milk;
  const khataCustomers = data?.khata.filter((row) => !row.is_grand_total) ?? [];
  const customerTotals = data?.khata.find((row) => row.is_grand_total);
  const receivables = { due: customerTotals?.receivables_due ?? 0, customerCredits: customerTotals?.customer_credits ?? 0 };
  const expenseGroups = data?.expenses.filter((row) => row.is_farm_cost) ?? [];
  const shiftTotals = milk ? milkShiftProduction(milk.shifts) : { morning: 0, noon: 0, evening: 0 };
  const cashBankClosing = data?.cashPosition.closing_cash_bank_balance ?? null;
  const milkVariance = milk ? milkReconciliationVariance({
    opening_litres: milk.totals.opening_litres, produced_litres: milk.totals.produced_litres,
    khata_litres: milk.totals.khata_litres, cash_litres: milk.totals.cash_litres,
    free_litres: milk.totals.free_litres, farm_use_litres: milk.totals.farm_use_litres,
    wasted_litres: milk.totals.wasted_litres, remaining_litres: milk.totals.closing_litres,
  }) : 0;
  const dailyWarnings = milk?.daily.filter((row) => milkReconciliationVariance(row) !== 0) ?? [];
  const hasSavedActivity = Boolean(data && (
    milk!.daily.length || financial!.period.customers.length || financial!.period.expenses.length
    || khataCustomers.some((row) => row.litres || row.charges || row.payments || row.opening_balance || row.opening_added)
    || financial!.otherIncome.length || data.ownerTransfers.deposit_count || data.ownerTransfers.withdrawal_count
    || financial!.accounts.some((row) => row.opening_balance || row.money_received || row.money_paid || row.closing_balance)
  ));

  const choosePreset = (value: FinalReportPreset) => {
    setPreset(value); setStatus("");
    if (value !== "custom") {
      const [start, end] = finalReportRange(value, today);
      setFrom(start); setTo(end);
    }
  };

  const runExport = async (action: ExportAction) => {
    if (!data || busy) return;
    setBusy(action); setStatus("");
    try {
      if (action === "print") {
        window.print();
        setStatus(exportStatus(action));
        return;
      }
      const sections: PdfSection[] = finalReportExportSections(data, from, to, today);
      const title = `Final Farm Report — ${periodText(from, to)}`;
      const filename = `final-farm-report-${from}-to-${to}`;
      if (action === "excel") {
        const flat = flattenFinancialExport(sections);
        const workbook = await buildXlsx("Final Farm Report", flat.columns, flat.rows);
        downloadBlob(`${filename}.xlsx`, new Blob([workbook], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
        setStatus(exportStatus(action));
        return;
      }
      const bytes = await buildPdfReport(title, sections, data.financial.period.farmName);
      if (action === "pdf") {
        downloadBlob(`${filename}.pdf`, new Blob([bytes], { type: "application/pdf" }));
        setStatus(exportStatus(action, "downloaded"));
      } else {
        const outcome = await sharePdfFile(`${filename}.pdf`, bytes, title, `${data.financial.period.farmName} · ${periodText(from, to)}`);
        setStatus(exportStatus(action, outcome));
      }
    } catch (error) {
      setStatus(`Final Report file nahi bani: ${friendlyError(error)}`);
    } finally { setBusy(null); }
  };

  return <>
    <PageHeader title="Final Report" sub="Chuni hui muddat ka doodh, Khata, kharcha aur Galla" back="/reports/" />
    <Body className="print-report final-report space-y-4 pb-8">
      <Panel title="Report ki muddat" className="no-print">
        <div className="flex flex-wrap gap-2">
          {presets.map(({ id, label }) => <button key={id} type="button" aria-pressed={preset === id} onClick={() => choosePreset(id)}
            className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === id ? "border-ink bg-ink text-white" : "border-line"}`}>{label}</button>)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Muddat shuru<input aria-label="Final Report shuru ki tareekh" type="date" value={from} max={to || today}
            onChange={(event) => { setPreset("custom"); setFrom(event.target.value); setStatus(""); }} className={`${field} mt-1`} /></label>
          <label className="text-sm font-semibold">Muddat khatam<input aria-label="Final Report aakhri tareekh" type="date" value={to} min={from || undefined} max={today}
            onChange={(event) => { setPreset("custom"); setTo(event.target.value); setStatus(""); }} className={`${field} mt-1`} /></label>
        </div>
        <p className="mt-2 text-sm text-muted">{periodText(from, to)}. Farm ki Pakistan tareekh istemal hoti hai.</p>
      </Panel>

      {!validRange && <p role="alert" className="text-sm text-udhaar">Aaj tak ki sahi muddat chunein. Report 10 saal tak ki ho sakti hai.</p>}
      {validRange && report.isPending && <p role="status" className="text-sm text-muted">Final Report load ho rahi hai…</p>}
      {validRange && report.isError && <p role="alert" className="text-sm text-udhaar">Final Report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {data && <>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="font-display text-2xl font-bold">Farm ki performance</h2><p className="text-sm text-muted">{periodText(from, to)} · {data.financial.period.farmName}</p></div>
          <p className="no-print text-sm text-muted">Sirf saved records. Yeh report koi entry nahi badalti.</p>
        </div>

        <Panel title="Aik nazar mein">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Kul doodh paidawar", litres(milk!.totals.produced_litres)],
              ["Doodh ki kul sales / billing", rs(milk!.totals.total_sales_amount)],
              ["Local / cash milk sales", rs(milk!.totals.cash_sale_amount)],
              ["Farm kharchay", rs(summary!.farm_expenses)],
              ["Farm munafa / nuqsan", rs(summary!.profit)],
              ["Customer se lena baqi", rs(receivables.due)],
              ...(cashBankClosing === null ? [] : [["Cash / bank closing", rs(cashBankClosing)]]),
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-muted">Billing saved sales ko dikhati hai; wasooli asal payment date par hai. Cash sale Galla receipt sirf us linked payment ko dikhati hai jo Farm Cash account mein darj hai.</p>
        </Panel>

        <Panel title="PDF, Excel, print aur share" className="no-print">
          <div className="flex flex-wrap gap-2">
            {(["pdf", "excel", "share", "print"] as const).map((action) => <button key={action} type="button" disabled={busy !== null} onClick={() => void runExport(action)}
              className={`min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-50 ${action === "share" ? "bg-berseem text-white" : "border-berseem text-berseem"}`}>
              {busy === action ? "File tayyar ho rahi hai…" : action === "pdf" ? "PDF download" : action === "excel" ? "Excel download" : action === "share" ? "PDF share karein" : "Print karein"}
            </button>)}
          </div>
          {status && <p role={status.startsWith("Final Report file nahi") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>

        {!hasSavedActivity && <Panel title="Is muddat mein koi record nahi"><p className="text-sm text-muted">Chuni hui muddat mein milk, Khata, kharcha, income ya owner movement ka saved record nahi mila. Khali report ko bhi export kiya ja sakta hai.</p></Panel>}

        <Panel title="Doodh ki paidawar aur taqseem">
          <p className="mb-3 text-sm text-muted">Subah, Dopehr aur Shaam ki paidawar saved milk shifts se hai. Free milk, ghar / farm ka istemal aur waste sales nahi hain.</p>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {(Object.keys(shiftNames) as (keyof typeof shiftNames)[]).map((shift) => <div key={shift} className="rounded-xl bg-ground p-3"><span className="text-sm text-muted">{shiftNames[shift]}</span><strong className="mt-1 block text-lg">{litres(shiftTotals[shift])}</strong></div>)}
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead><tr>{["Hissa", "Doodh (L)", "Raqam (Rs)"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left last:text-right">{label}</th>)}</tr></thead>
            <tbody>{[
              ["Khata customers / company", milk!.totals.khata_litres, milk!.totals.khata_amount],
              ["Local / cash customers", milk!.totals.cash_litres, milk!.totals.cash_sale_amount],
              ["Free / khairat / gifts", milk!.totals.free_litres, null],
              ["Farm / ghar istemal", milk!.totals.farm_use_litres, null],
              ["Zaya / kharab", milk!.totals.wasted_litres, null],
              ["Allocated total", milk!.totals.allocated_litres, null],
              ["Closing / baqi stock", milk!.totals.closing_litres, null],
            ].map(([label, amount, money]) => <tr key={String(label)}><td className="border-b border-line px-2 py-2">{label}</td><td className="border-b border-line px-2 py-2">{litres(Number(amount))}</td><td className="border-b border-line px-2 py-2 text-right">{money == null ? "—" : rs(Number(money))}</td></tr>)}</tbody>
          </table></div>
          <p className="mt-3 text-sm text-muted">Milk sales total mein Khata billing aur local cash sales dono shamil hain; cash sale is liye dobara add nahi ki gayi. Company bills daily report mein hain; un ka shift link saved nahi hota.</p>
        </Panel>

        <Panel title="Doodh ka stock milan">
          <p className="mb-3 text-sm text-muted">Shuru ka doodh + paidawar = Khata sale + cash sale + free + farm / ghar use + waste + aakhir ka stock.</p>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Shuru ka stock", litres(milk!.totals.opening_litres)], ["Nayi paidawar", litres(milk!.totals.produced_litres)],
              ["Mojood doodh", litres(milk!.totals.available_litres)], ["Taqseem shuda doodh", litres(milk!.totals.allocated_litres)],
              ["Aakhir ka stock", litres(milk!.totals.closing_litres)], ["Milan ka farq", litres(milkVariance)],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}
          </dl>
          {milkVariance !== 0 && <p role="alert" className="mt-3 rounded-xl border border-udhaar/40 bg-udhaar/5 p-3 text-sm text-udhaar">Milk balance mein {litres(milkVariance)} ka farq hai. Yeh missing entry ya correction ho sakti hai; ise misconduct na samjhein. <Link className="font-semibold underline" href={`/reports/milk/?from=${from}&to=${to}`}>Milk Report mein records dekhein</Link>.</p>}
          {milkVariance === 0 && <p role="status" className="mt-3 text-sm text-berseem-deep">Chuni hui muddat ka doodh balance mil raha hai.</p>}
          {dailyWarnings.length > 0 && <div className="mt-3 rounded-xl border border-udhaar/40 p-3"><h3 className="font-semibold">Rozana milan check</h3><ul className="mt-2 space-y-1 text-sm">{dailyWarnings.slice(0, 20).map((row) => <li key={row.report_date}>{formatDay(row.report_date)}: {litres(milkReconciliationVariance(row))} ka farq</li>)}</ul>{dailyWarnings.length > 20 && <p className="mt-2 text-xs text-muted">Mazeed {dailyWarnings.length - 20} din ka farq export mein shamil hai.</p>}</div>}
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead><tr>{["Tareekh", "Opening", "Paidawar", "Available", "Khata", "Cash", "Free", "Ghar / farm", "Waste", "Allocated", "Closing", "Farq"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>
            {milk!.daily.map((row) => <tr key={row.report_date}><td className="border-b border-line px-2 py-2">{formatDay(row.report_date)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.opening_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.produced_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.available_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.khata_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.cash_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.free_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.farm_use_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.wasted_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(row.allocated_litres)}</td>
              <td className="border-b border-line px-2 py-2 text-right font-semibold">{litres(row.remaining_litres)}</td><td className="border-b border-line px-2 py-2 text-right">{litres(milkReconciliationVariance(row))}</td></tr>)}
          </tbody></table></div>
          {!milk!.daily.length && <p className="mt-3 text-sm text-muted">Is muddat mein saved milk shift nahi mili.</p>}
        </Panel>

        <Panel title="Customer Khata ka maahana hisaab">
          <p className="mb-3 text-sm text-muted">Baqaya ki carry-forward, charges, receipts aur adjustments existing Khata database report se hain. Manfi closing balance customer ka advance hai.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm">
            <thead><tr>{["Customer", "Doodh (L)", "Shuru ka baqaya", "Naya opening", "Bill", "Total payable", "Wasooli", "Riayat", "Wapsi", "Closing"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead>
            <tbody>{khataCustomers.map((row) => <tr key={row.customer_id}>
              <td className="border-b border-line px-2 py-2"><Link className="font-semibold text-berseem underline" href={`/reports/customer/?id=${row.customer_id}&from=${from}&to=${to}`}>{row.name}</Link></td>
              <td className="border-b border-line px-2 py-2 text-right">{litres(row.litres)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_balance)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_added)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.total_payable)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td>
              <td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td>
            </tr>)}</tbody>
            {customerTotals && <tfoot><tr className="border-t-2 border-line font-bold"><td className="px-2 py-2">Majmua</td><td className="px-2 py-2 text-right">{litres(customerTotals.litres)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.opening_balance)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.opening_added)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.charges)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.total_payable)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.payments)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.discounts)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.refunds)}</td><td className="px-2 py-2 text-right">{rs(customerTotals.closing_balance)}</td></tr></tfoot>}
          </table></div>
          {!khataCustomers.length && <p className="mt-2 text-sm text-muted">Is muddat mein Khata customer ka koi saved balance ya transaction nahi.</p>}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Local / cash milk sales">
            <p className="mb-3 text-sm text-muted">Cash sale ko Khata billing se alag rakha gaya hai. Farm Galla receipt sirf linked cash-sale payments ka woh hissa hai jo Farm Cash account mein darj hua.</p>
            <dl className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Kul cash-sale litres</dt><dd className="font-bold">{litres(milk!.totals.cash_litres)}</dd></div><div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Cash-sale amount</dt><dd className="font-bold">{rs(milk!.totals.cash_sale_amount)}</dd></div><div className="rounded-xl bg-ground p-3 sm:col-span-2"><dt className="text-sm text-muted">Farm Galla mein asal receipt</dt><dd className="font-bold">{rs(milk!.totals.galla_cash_received)}</dd></div></dl>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[470px] text-sm"><thead><tr>{["Tareekh", "Sale (L)", "Sale amount", "Galla receipt"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left last:text-right">{label}</th>)}</tr></thead><tbody>
              {milk!.daily.filter((row) => row.cash_litres || row.cash_sale_amount || row.galla_cash_received).map((row) => <tr key={row.report_date}><td className="border-b border-line px-2 py-2">{formatDay(row.report_date)}</td><td className="border-b border-line px-2 py-2">{litres(row.cash_litres)}</td><td className="border-b border-line px-2 py-2">{rs(row.cash_sale_amount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.galla_cash_received)}</td></tr>)}
            </tbody></table></div>
            {!milk!.daily.some((row) => row.cash_litres || row.cash_sale_amount || row.galla_cash_received) && <p className="mt-2 text-sm text-muted">Is muddat mein local cash sale nahi mili.</p>}
            <Link href="/reports/milk/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-berseem underline">Milk Report kholein →</Link>
          </Panel>

          <Panel title="Farm kharchay aur category">
            <p className="mb-3 text-sm text-muted">Category totals saved Kharcha rows se hain. Inventory purchase aur salary-linked costs ledger mein aik hi martaba shamil hain.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead><tr>{["Category", "Entries", "Raqam"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-left last:text-right">{label}</th>)}</tr></thead><tbody>
              {expenseGroups.map((row) => <tr key={row.category}><td className="border-b border-line px-2 py-2">{row.category}</td><td className="border-b border-line px-2 py-2">{row.entries}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.amount)}</td></tr>)}
            </tbody></table></div>
            {!expenseGroups.length && <p className="mt-2 text-sm text-muted">Is muddat mein farm kharcha darj nahi hua.</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm"><strong>Farm kharchay: {rs(summary!.farm_expenses)}</strong><span>Ghar / zaati alag: {rs(summary!.home_expenses)}</span></div>
            <Link href="/reports/kharcha/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-berseem underline">Kharcha Report kholein →</Link>
          </Panel>
        </div>

        <Panel title="Farm munafa / nuqsan">
          <p className="mb-3 text-sm text-muted">Yeh total Financial Report ke authoritative database summary se hai. Billed income aur actual wasooli alag hain; owner transfer munafa ya kharcha nahi.</p>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Milk / company billed</dt><dd className="font-bold">{rs(summary!.milk_income)}</dd></div>
            <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Doosri aamdani</dt><dd className="font-bold">{rs(summary!.other_income)}</dd></div>
            <div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Farm kharcha</dt><dd className="font-bold">− {rs(summary!.farm_expenses)}</dd></div>
            <div className="rounded-xl bg-berseem-soft p-3"><dt className="text-sm text-muted">Net munafa / nuqsan</dt><dd className="font-display text-lg font-bold">{rs(summary!.profit)}</dd></div>
          </dl>
          <p className="mt-3 text-sm">Customer collections: {rs(summary!.cash_collected)}. Yeh bills se minus nahi hotin; refunds aur advances Khata mein alag rehte hain.</p>
          <Link href="/reports/financial/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-berseem underline">Financial Report kholein →</Link>
        </Panel>

        <Panel title="Galla aur bank account ka cash flow">
          <p className="mb-3 text-sm text-muted">Har account ka opening + wasooli − adaigi + transfer andar − transfer bahar = closing. Cash aur bank balances closing date tak ledger se hain.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead><tr>{["Account", "Qism", "Opening", "Wasool", "Ada", "Transfer andar", "Transfer bahar", "Closing"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>
            {financial!.accounts.map((row) => <tr key={row.account_id}><td className="border-b border-line px-2 py-2">{row.account_name}</td><td className="border-b border-line px-2 py-2">{row.account_kind === "person" ? "Zaati" : row.account_kind === "cash" ? "Cash" : "Bank"}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.money_received)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.money_paid)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.transfers_in)}</td>
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.transfers_out)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td></tr>)}
          </tbody></table></div>
          {!financial!.accounts.length && <p className="mt-2 text-sm text-muted">Is muddat mein account balance ya movement nahi.</p>}
        </Panel>

        <Panel title="Owner deposits aur withdrawals">
          <p className="mb-3 text-sm text-muted">Yeh Farm Galla aur Maalik ke marked account ke transfers hain; farm ki aamdani ya operating kharcha nahi.</p>
          <dl className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Owner deposits</dt><dd className="font-bold">{rs(data.ownerTransfers.total_deposits)} · {data.ownerTransfers.deposit_count} entries</dd></div><div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Owner withdrawals</dt><dd className="font-bold">{rs(data.ownerTransfers.total_withdrawals)} · {data.ownerTransfers.withdrawal_count} entries</dd></div><div className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">Net deposit − withdrawal</dt><dd className="font-bold">{rs(data.ownerTransfers.net_amount)}</dd></div></dl>
          <Link href="/reports/accounts/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-berseem underline">Accounts Report mein detail dekhein →</Link>
        </Panel>

        <Panel title="Customer receivables aur advances">
          <p className="mb-3 text-sm text-muted">Closing positive balance lena baqi hai. Negative closing balance customer ka advance hai.</p>
          <div className="flex flex-wrap gap-4 text-sm"><strong>Lena baqi: {rs(receivables.due)}</strong><span>Customer advances: {rs(receivables.customerCredits)}</span></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[840px] text-sm"><thead><tr>{["Customer", "Opening", "Charges", "Wasooli", "Riayat", "Wapsi", "Closing"].map((label) => <th key={label} className="border-b border-line px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>
            {khataCustomers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.closing_balance)}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </>}
    </Body>
  </>;
}
