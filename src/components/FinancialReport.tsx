"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "@/components/ui";
import { addDays, daysBetween, formatDay, formatMonth, monthStart, todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { rs } from "@/lib/format";
import { isReportDateRange } from "@/lib/reporting";
import {
  accountCashflowReconciles, financialReportExportSections, flattenFinancialExport,
  groupFinancialExpenses, groupOtherIncome, loadFinancialAccountLedger, loadFinancialReport,
  receivableTotals, salaryPayableTotal,
} from "@/lib/financial-report";
import { buildPdfReport, buildXlsx, downloadBlob, downloadFile, toCsv } from "@/lib/export-data";
import { sharePdfFile } from "@/lib/pdf-share";

type Preset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
type ExportAction = "pdf" | "excel" | "csv" | "print" | "share";
const input = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const labelByIncome: Record<string, string> = { animal_sale: "Janwar ki farokht", manure: "Gobar ki farokht", other: "Doosri darj aamdani" };
const presetLabels: Record<Preset, string> = {
  today: "Aaj", yesterday: "Kal", week: "Yeh hafta", month: "Yeh maheena", year: "Yeh saal", custom: "Apni muddat",
};
const expenseType = (farm: boolean) => farm ? "Farm" : "Ghar / zaati";
const classificationLabel = (classification: string) => classification === "Farm" ? "Farm" : "Ghar / zaati";
const accountKindLabel = (kind: string) => ({ cash: "Cash", bank: "Bank", person: "Zaati account" }[kind] ?? kind);
const entryKindLabel = (kind: string) => ({
  opening_balance: "Shuru ka balance", payment: "Wusooli", other_income: "Doosri aamdani",
  transfer_in: "Account mein transfer", transfer_out: "Account se transfer", expense: "Kharcha",
}[kind] ?? kind.replaceAll("_", " "));
const periodText = (from: string, to: string) => `${formatDay(from)} – ${formatDay(to)}`;

function mondayStart(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function presetRange(preset: Preset, today: string): [string, string] {
  if (preset === "yesterday") { const yesterday = addDays(today, -1); return [yesterday, yesterday]; }
  if (preset === "week") return [mondayStart(today), today];
  if (preset === "month") return [monthStart(today), today];
  if (preset === "year") return [`${today.slice(0, 4)}-01-01`, today];
  if (preset === "custom") return [today, today];
  return [today, today];
}

function TrendBars({ rows, from, to, cash = false }: {
  rows: { bucket_start: string; total_income: number; farm_expenses: number; cash_received: number; cash_paid: number }[];
  from: string; to: string; cash?: boolean;
}) {
  const values = rows.flatMap((row) => cash ? [row.cash_received, row.cash_paid] : [row.total_income, row.farm_expenses]);
  const max = Math.max(1, ...values);
  const daily = daysBetween(from, to) < 90;
  const first = cash ? "cash_received" : "total_income";
  const second = cash ? "cash_paid" : "farm_expenses";
  return <div className="overflow-x-auto rounded-xl border border-line p-3" aria-label={cash ? "Cash ki aamad aur adaigi ka rujhan" : "Aamdani aur kharchay ka rujhan"}>
    <div className="flex min-w-max items-end gap-2" role="img" aria-label={cash ? "Wasool aur ada ki gayi raqam ka chart" : "Aamdani aur farm kharchay ka chart"}>
      {rows.map((row) => <div key={row.bucket_start} className="flex w-14 flex-col items-center gap-1">
        <div className="flex h-36 items-end gap-1" title={`${daily ? formatDay(row.bucket_start) : formatMonth(row.bucket_start)} · ${cash ? "Wasool " + rs(row.cash_received) + ", ada " + rs(row.cash_paid) : "Aamdani " + rs(row.total_income) + ", farm kharcha " + rs(row.farm_expenses)}`}>
          <span className="w-4 rounded-t bg-berseem" style={{ height: `${Math.max(1, (row[first] / max) * 100)}%` }} />
          <span className="w-4 rounded-t bg-udhaar" style={{ height: `${Math.max(1, (row[second] / max) * 100)}%` }} />
        </div>
        <span className="max-w-14 truncate text-[10px] text-muted">{daily ? row.bucket_start.slice(5) : row.bucket_start.slice(0, 7)}</span>
      </div>)}
      {!rows.length && <p className="p-3 text-sm text-muted">Is muddat mein chart ke liye koi entry nahi.</p>}
    </div>
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-berseem" />{cash ? "Wasool" : "Farm aamdani"}</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-udhaar" />{cash ? "Ada" : "Farm kharchay"}</span></p>
  </div>;
}

export default function FinancialReport() {
  const today = todayPK();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(today);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [status, setStatus] = useState("");
  const valid = isReportDateRange(from, to, today);
  const report = useQuery({ queryKey: ["financial-report", from, to], enabled: valid, queryFn: () => loadFinancialReport(from, to) });
  const data = report.data;
  const selectedAccount = data?.accounts.find((account) => account.account_id === selectedAccountId) ?? data?.accounts[0];
  const ledger = useQuery({
    queryKey: ["financial-account-ledger", selectedAccount?.account_id, from, to],
    enabled: valid && Boolean(selectedAccount),
    queryFn: () => loadFinancialAccountLedger(selectedAccount!.account_id, from, to, selectedAccount!),
  });

  const choosePreset = (value: Preset) => {
    setPreset(value); setStatus("");
    if (value !== "custom") {
      const [start, end] = presetRange(value, today);
      setFrom(start); setTo(end);
    }
  };

  const exportAction = async (action: ExportAction) => {
    if (!data || busy) return;
    if (action !== "print" && ledger.isPending) return;
    setBusy(action); setStatus("");
    try {
      if (action === "print") { window.print(); setStatus("Print khul gaya hai."); return; }
      const sections = financialReportExportSections(data, ledger.data ?? [], from, to, today);
      const title = `Maali Report — ${periodText(from, to)}`;
      const filename = `maali-report-${from}-to-${to}`;
      if (action === "csv" || action === "excel") {
        const flat = flattenFinancialExport(sections);
        if (action === "csv") downloadFile(`${filename}.csv`, toCsv(flat.columns, flat.rows, "Maali Report"), "text/csv;charset=utf-8");
        else downloadBlob(`${filename}.xlsx`, new Blob([await buildXlsx("Maali Report", flat.columns, flat.rows)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
        setStatus(action === "csv" ? "CSV file download ho gayi." : "Excel file download ho gayi.");
        return;
      }
      const bytes = await buildPdfReport(title, sections, data.period.farmName);
      if (action === "pdf") {
        downloadBlob(`${filename}.pdf`, new Blob([bytes], { type: "application/pdf" }));
        setStatus("PDF download ho gayi.");
      } else {
        const outcome = await sharePdfFile(`${filename}.pdf`, bytes, title, `${data.period.farmName} · ${periodText(from, to)}`);
        setStatus(outcome === "shared" ? "Share menu khul gaya hai. Bhejne se pehle file aur shakhs check kar lein." : outcome === "cancelled" ? "Share cancel ho gaya." : "Yahan file share nahi ho sakti; PDF download kar di hai.");
      }
    } catch (error) { setStatus(`Maali report export nahi ho saki: ${friendlyError(error)}`); }
    finally { setBusy(null); }
  };

  const summary = data?.period.summary;
  const receivables = data ? receivableTotals(data.customers) : { due: 0, customerCredits: 0 };
  const pendingSalaries = data ? salaryPayableTotal(data.salaryPayables) : 0;
  const expenseGroups = data ? groupFinancialExpenses(data.period.expenses) : [];
  const incomeGroups = data ? groupOtherIncome(data.otherIncome) : [];
  const receivedTotal = (summary?.cash_collected ?? 0) + (summary?.other_income ?? 0);
  const maxExpense = Math.max(1, ...expenseGroups.map((row) => row.amount));
  const accountTotals = data?.accounts.reduce((totals, account) => ({
    opening: totals.opening + account.opening_balance,
    received: totals.received + account.money_received,
    paid: totals.paid + account.money_paid,
    transferIn: totals.transferIn + account.transfers_in,
    transferOut: totals.transferOut + account.transfers_out,
    closing: totals.closing + account.closing_balance,
  }), { opening: 0, received: 0, paid: 0, transferIn: 0, transferOut: 0, closing: 0 });
  const allAccountsReconcile = data?.accounts.every(accountCashflowReconciles) ?? true;
  const exportReady = Boolean(data && (ledger.isSuccess || !selectedAccount));

  return <>
    <PageHeader title="Maali Report" sub="Farm ki aamdani, kharchay, raqam ki aamad o raft aur baqaya" back="/reports/" />
    <Body className="print-report space-y-4 pb-8">
      <Panel title="Report ki muddat" className="no-print">
        <div className="flex flex-wrap gap-2">{(Object.keys(presetLabels) as Preset[]).map((value) => <button
          type="button" key={value} aria-pressed={preset === value} onClick={() => choosePreset(value)}
          className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === value ? "border-ink bg-ink text-white" : "border-line"}`}
        >{presetLabels[value]}</button>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Tareekh se<input aria-label="Maali report ki shuru ki tareekh" type="date" value={from} max={to || today} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); setStatus(""); }} className={`${input} mt-1`} /></label>
          <label className="text-sm font-semibold">Tareekh tak<input aria-label="Maali report ki aakhri tareekh" type="date" value={to} min={from || undefined} max={today} onChange={(event) => { setPreset("custom"); setTo(event.target.value); setStatus(""); }} className={`${input} mt-1`} /></label>
        </div>
        {!valid && <p role="alert" className="mt-3 text-sm text-udhaar">Tareekh ki muddat durust rakhein: aaj ya us se pehle khatam ho aur 10 saal se lambi na ho.</p>}
        {valid && <p className="mt-3 text-sm text-muted">Report ki muddat: <strong>{periodText(from, to)}</strong></p>}
      </Panel>

      {valid && report.isPending && <p role="status">Maali report load ho rahi hai…</p>}
      {valid && report.isError && <p role="alert" className="text-udhaar">Maali report nahi khuli: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
      {data && summary && <>
        <Panel title="Khulasa">
          <p className="mb-3 text-sm text-muted">Aamdani aur farm munafa darj hisaab ke mutabiq hain. Customer ki net wasooli aur doosri aamdani shamil hai; accounts ke darmiyan transfer shamil nahi.</p>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Farm ki kul aamdani", rs(summary.milk_income + summary.other_income), "Doodh aur doosri darj aamdani"],
              ["Kul wasooli", rs(receivedTotal), "Customer se wapsi minus karke wasooli aur doosri aamdani; transfer shamil nahi"],
              ["Kul kharchay", rs(summary.farm_expenses + summary.home_expenses), "Farm aur ghar / zaati kharcha alag dikhaya gaya hai"],
              ["Farm ka munafa / nuqsan", rs(summary.profit), "Ghar / zaati kharchay farm munafay mein shamil nahi"],
              ["Customer ka baqaya", rs(receivables.due), `${formatDay(to)} tak; customer advance ${rs(receivables.customerCredits)}`],
              ["Baaki tankhwah", rs(pendingSalaries), `${formatDay(to)} tak ka tankhwah record`],
            ].map(([label, value, detail]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd><dd className="mt-1 text-xs text-muted">{detail}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm text-muted">Supplier ka baqaya yahan nahi dikhaya kyun ke supplier ka alag udhaar ledger darj nahi. Har litre ka kharcha bhi nahi nikala: farm kharchay ko doodh ke litres mein baantne ka muqarrar tareeqa maujood nahi.</p>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            {(["pdf", "excel", "csv", "print", "share"] as ExportAction[]).map((action) => <button key={action} type="button" disabled={busy !== null || !exportReady}
              onClick={() => void exportAction(action)} className={`min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-50 ${action === "share" ? "bg-berseem text-white" : "border-line"}`}>
              {action === "pdf" ? "PDF download" : action === "excel" ? "Excel download" : action === "csv" ? "CSV download" : action === "print" ? "Print karein" : "PDF share karein"}
            </button>)}
          </div>
          {status && <p role={status.startsWith("Maali report export nahi ho saki") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Aamdani ke zariye">
            <p className="mb-3 text-sm text-muted">Bill shuda farokht aur doosri darj aamdani kul aamdani hai. Customer ki wasooli alag dikhai jati hai aur bill shuda aamdani ko kam nahi karti.</p>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-3 py-2"><dt>Doodh ki delivery aur company bill (bill shuda)</dt><dd className="font-semibold">{rs(summary.milk_income)}</dd></div>
              {incomeGroups.map((row) => <div key={row.kind} className="flex justify-between gap-3 py-2"><dt>{row.label}</dt><dd className="font-semibold">{rs(row.amount)}</dd></div>)}
              <div className="flex justify-between gap-3 border-t border-line py-2 font-bold"><dt>Farm ki kul aamdani</dt><dd>{rs(summary.milk_income + summary.other_income)}</dd></div>
            </dl>
            <h3 className="mt-4 font-semibold">Customer ke bill aur wasooli</h3>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Customer", "Bill", "Wasooli", "Riayat", "Wapsi"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.period.customers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2">{rs(row.charged)}</td><td className="border-b border-line px-2 py-2">{rs(row.paid)}</td><td className="border-b border-line px-2 py-2">{rs(row.discount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refund)}</td></tr>)}
            </tbody></table></div>
            {!data.period.customers.length && <p className="mt-2 text-sm text-muted">Is muddat mein customer ka koi bill ya wasooli nahi.</p>}
            <h3 className="mt-4 font-semibold">Doosri aamdani ki entries</h3>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead><tr>{["Tareekh", "Zariya", "Janwar", "Note", "Raqam"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.otherIncome.map((row) => <tr key={row.income_id}><td className="border-b border-line px-2 py-2">{row.income_date}</td><td className="border-b border-line px-2 py-2">{labelByIncome[row.kind] ?? "Darj aamdani"}</td><td className="border-b border-line px-2 py-2">{row.animal_tag ?? "—"}</td><td className="border-b border-line px-2 py-2">{row.note ?? "—"}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.amount)}</td></tr>)}
            </tbody></table></div>
            {!data.otherIncome.length && <p className="mt-2 text-sm text-muted">Is muddat mein doosri aamdani darj nahi hui.</p>}
          </Panel>

          <Panel title="Aamdani aur kharcha">
            <p className="mb-3 text-sm text-muted">Farm ki aamdani mein doodh aur company ke bill, aur doosri darj aamdani shamil hai. Is mein se farm ke kharchay minus hote hain. Ghar / zaati kharcha farm munafay mein shamil nahi.</p>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-3 py-2"><dt>Doodh ki delivery aur company bill</dt><dd>{rs(summary.milk_income)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Doosri darj aamdani</dt><dd>{rs(summary.other_income)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Farm ke rozmarra kharchay</dt><dd>− {rs(summary.farm_expenses)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line py-2 text-lg font-bold"><dt>Farm ka net munafa / nuqsan</dt><dd>{rs(summary.profit)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Ghar / zaati kharchay (alag)</dt><dd>{rs(summary.home_expenses)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Ada ki gayi tankhwah kharchay ke ledger mein sirf aik martaba gini jati hai. Neeche ki baqi tankhwah ada talab raqam hai, mazeed kharcha nahi. Inventory se jura kharcha bhi aik martaba hi shamil hai.</p>
          </Panel>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Darj qism ke mutabiq kharchay">
            <p className="mb-3 text-sm text-muted">Farm ke kharchay farm munafay mein shamil hain. Ghar / zaati kharchay alag dikhaye gaye hain.</p>
            <div className="space-y-3">{expenseGroups.map((row) => <div key={`${row.classification}-${row.category}`}>
              <div className="mb-1 flex justify-between gap-2 text-sm"><span>{row.category} <span className="text-muted">· {classificationLabel(row.classification)} · {row.entries} dafaa</span></span><strong>{rs(row.amount)}</strong></div>
              <div className="h-2 rounded-full bg-ground"><div className={`h-2 rounded-full ${row.classification === "Farm" ? "bg-berseem" : "bg-udhaar"}`} style={{ width: `${Math.max(1, row.amount / maxExpense * 100)}%` }} /></div>
            </div>)}</div>
            {!expenseGroups.length && <p className="text-sm text-muted">Is muddat mein koi kharcha darj nahi hua.</p>}
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Tareekh", "Qism / tafseel", "Farm ya ghar", "Account", "Raqam"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.period.expenses.map((row, index) => <tr key={`${row.expense_date}-${row.category}-${index}`}><td className="border-b border-line px-2 py-2">{row.expense_date}</td><td className="border-b border-line px-2 py-2">{row.category}{row.note ? ` · ${row.note}` : ""}</td><td className="border-b border-line px-2 py-2">{expenseType(row.is_farm_cost)}</td><td className="border-b border-line px-2 py-2">{row.account}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.amount)}</td></tr>)}
            </tbody></table></div>
          </Panel>

          <Panel title="Customer ka baqaya">
            <p className="mb-3 text-sm text-muted">Aakhri balance Khata ke hisaab se {formatDay(to)} ka hai. Musbat raqam customer se leni hai; manfi raqam customer ka advance hai.</p>
            <div className="mb-3 flex flex-wrap gap-4 text-sm"><strong>Lena baqi: {rs(receivables.due)}</strong><span>Customer ka advance: {rs(receivables.customerCredits)}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Customer", "Shuru ka baqaya", "Naya baqaya", "Bill", "Wasooli", "Riayat", "Wapsi", "Aakhri baqaya"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.customers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2">{rs(row.opening_added)}</td><td className="border-b border-line px-2 py-2">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td></tr>)}
            </tbody></table></div>
            {!data.customers.length && <p className="text-sm text-muted">Is muddat mein customer ka baqaya ya koi entry nahi.</p>}
          </Panel>
        </div>

        <Panel title="Galla aur account mein raqam ka hisaab">
          <p className="mb-3 text-sm text-muted">Shuru ka baqaya + wasooli − adaigi + andar aane wala transfer − bahar jane wala transfer = aakhri baqaya. Muddat mein khulay accounts ki raqam bhi shamil hai. Accounts ke darmiyan transfer aamdani ya kharcha nahi hota.</p>
          {!allAccountsReconcile && <p role="alert" className="mb-3 text-udhaar">Kam az kam aik account ka hisaab ledger se nahi milta. Darj entries check karein.</p>}
          {allAccountsReconcile && <p role="status" className="mb-3 text-sm text-berseem-deep">Har account ka aakhri baqaya us ke ledger se milta hai.</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-sm"><thead><tr>{["Account", "Shuru ka baqaya", "Wasool", "Ada", "Andar transfer", "Bahar transfer", "Aakhri baqaya"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.accounts.map((row) => <tr key={row.account_id}><td className="border-b border-line px-2 py-2">{row.account_name} <span className="text-muted">· {accountKindLabel(row.account_kind)}</span></td><td className="border-b border-line px-2 py-2">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2">{rs(row.money_received)}</td><td className="border-b border-line px-2 py-2">{rs(row.money_paid)}</td><td className="border-b border-line px-2 py-2">{rs(row.transfers_in)}</td><td className="border-b border-line px-2 py-2">{rs(row.transfers_out)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td></tr>)}
          </tbody>{accountTotals && <tfoot><tr className="font-bold"><td className="px-2 py-2">Tamam accounts</td><td className="px-2 py-2">{rs(accountTotals.opening)}</td><td className="px-2 py-2">{rs(accountTotals.received)}</td><td className="px-2 py-2">{rs(accountTotals.paid)}</td><td className="px-2 py-2">{rs(accountTotals.transferIn)}</td><td className="px-2 py-2">{rs(accountTotals.transferOut)}</td><td className="px-2 py-2 text-right">{rs(accountTotals.closing)}</td></tr></tfoot>}</table></div>
          {!data.accounts.length && <p className="mt-2 text-sm text-muted">Is muddat mein account ka koi baqaya ya harkat nahi.</p>}
          {selectedAccount && <div className="mt-4 border-t border-line pt-4">
            <label className="block max-w-sm text-sm font-semibold">Ledger ki tafseel<select aria-label="Account ledger ki tafseel" value={selectedAccount.account_id} onChange={(event) => setSelectedAccountId(event.target.value)} className={`${input} mt-1`}>{data.accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.account_name}</option>)}</select></label>
            {ledger.isPending && <p role="status" className="mt-3 text-sm">Account ki entries load ho rahi hain…</p>}
            {ledger.isError && <p role="alert" className="mt-3 text-sm text-udhaar">Account ki tafseel nahi khuli: {friendlyError(ledger.error)} <button type="button" onClick={() => void ledger.refetch()} className="underline">Dobara koshish</button></p>}
            {ledger.data && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Tareekh", "Harkat", "Tafseel", "Aamad", "Adaigi"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {ledger.data.map((entry) => <tr key={entry.ref_id}><td className="border-b border-line px-2 py-2">{entry.entry_date}</td><td className="border-b border-line px-2 py-2">{entryKindLabel(entry.entry_kind)}</td><td className="border-b border-line px-2 py-2">{entry.description}</td><td className="border-b border-line px-2 py-2">{entry.money_in ? rs(entry.money_in) : "—"}</td><td className="border-b border-line px-2 py-2 text-right">{entry.money_out ? rs(entry.money_out) : "—"}</td></tr>)}
            </tbody></table>{!ledger.data.length && <p className="mt-2 text-sm text-muted">Is account aur muddat ki koi ledger entry nahi.</p>}</div>}
          </div>}
        </Panel>

        <Panel title="Baqi tankhwah">
          <p className="mb-3 text-sm text-muted">{formatDay(to)} tak tay tankhwah mein se linked kharchay ki adaigi minus ki gayi hai. Ada ki hui tankhwah pehle hi ledger aur farm munafay mein aik martaba shamil hai.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr>{["Mulazim", "Tankhwah ka maheena", "Tay shuda", "Ada shuda", "Baqi"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.salaryPayables.filter((row) => row.outstanding_amount > 0).map((row) => <tr key={`${row.staff_id}-${row.salary_month}`}><td className="border-b border-line px-2 py-2">{row.staff_name}</td><td className="border-b border-line px-2 py-2">{formatMonth(row.salary_month)}</td><td className="border-b border-line px-2 py-2">{rs(row.agreed_amount)}</td><td className="border-b border-line px-2 py-2">{rs(row.paid_amount)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.outstanding_amount)}</td></tr>)}
          </tbody></table></div>
          {!data.salaryPayables.some((row) => row.outstanding_amount > 0) && <p className="text-sm text-muted">Is tareekh tak koi baqi tankhwah darj nahi.</p>}
        </Panel>

        <Panel title="Aamdani, munafa aur raqam ka rujhan">
          <p className="mb-3 text-sm text-muted">90 din tak rozana aur is se lambi muddat mein maheena war hisaab dikhaya jata hai. Cash chart mein transfer shamil nahi; muddat ke andar darj account-opening balance wasooli ya adaigi mein shamil hai.</p>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            <div><h3 className="mb-2 font-semibold">Farm ki aamdani aur rozmarra kharchay</h3><TrendBars rows={data.trends} from={from} to={to} /></div>
            <div><h3 className="mb-2 font-semibold">Account mein wasooli aur adaigi</h3><TrendBars rows={data.trends} from={from} to={to} cash /></div>
          </div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Muddat", "Farm aamdani", "Farm kharchay", "Ghar ke kharchay", "Munafa / nuqsan", "Wapsi ke baad net wasooli", "Raqam aayi", "Raqam gayi"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.trends.map((row) => <tr key={row.bucket_start}><td className="border-b border-line px-2 py-2">{daysBetween(from, to) < 90 ? formatDay(row.bucket_start) : formatMonth(row.bucket_start)}</td><td className="border-b border-line px-2 py-2">{rs(row.total_income)}</td><td className="border-b border-line px-2 py-2">{rs(row.farm_expenses)}</td><td className="border-b border-line px-2 py-2">{rs(row.home_expenses)}</td><td className="border-b border-line px-2 py-2">{rs(row.net_profit)}</td><td className="border-b border-line px-2 py-2">{rs(row.customer_collections)}</td><td className="border-b border-line px-2 py-2">{rs(row.cash_received)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_paid)}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </>}
    </Body>
  </>;
}
