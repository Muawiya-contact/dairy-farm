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
const labelByIncome: Record<string, string> = { animal_sale: "Animal sale", manure: "Manure", other: "Other recorded income" };
const presetLabels: Record<Preset, string> = {
  today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", year: "This year", custom: "Custom range",
};
const expenseType = (farm: boolean) => farm ? "Farm" : "Home / personal";
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
  return <div className="overflow-x-auto rounded-xl border border-line p-3" aria-label={cash ? "Cash movement trend" : "Income and expense trend"}>
    <div className="flex min-w-max items-end gap-2" role="img" aria-label={cash ? "Bar chart of cash received and paid" : "Bar chart of income and farm expenses"}>
      {rows.map((row) => <div key={row.bucket_start} className="flex w-14 flex-col items-center gap-1">
        <div className="flex h-36 items-end gap-1" title={`${daily ? formatDay(row.bucket_start) : formatMonth(row.bucket_start)} · ${cash ? "In " + rs(row.cash_received) + ", out " + rs(row.cash_paid) : "Income " + rs(row.total_income) + ", farm expense " + rs(row.farm_expenses)}`}>
          <span className="w-4 rounded-t bg-berseem" style={{ height: `${Math.max(1, (row[first] / max) * 100)}%` }} />
          <span className="w-4 rounded-t bg-udhaar" style={{ height: `${Math.max(1, (row[second] / max) * 100)}%` }} />
        </div>
        <span className="max-w-14 truncate text-[10px] text-muted">{daily ? row.bucket_start.slice(5) : row.bucket_start.slice(0, 7)}</span>
      </div>)}
      {!rows.length && <p className="p-3 text-sm text-muted">No activity to chart for this period.</p>}
    </div>
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-berseem" />{cash ? "Received" : "Farm income"}</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-udhaar" />{cash ? "Paid" : "Farm expenses"}</span></p>
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
      if (action === "print") { window.print(); setStatus("Print dialog opened."); return; }
      const sections = financialReportExportSections(data, ledger.data ?? [], from, to, today);
      const title = `Financial Report — ${periodText(from, to)}`;
      const filename = `financial-report-${from}-to-${to}`;
      if (action === "csv" || action === "excel") {
        const flat = flattenFinancialExport(sections);
        if (action === "csv") downloadFile(`${filename}.csv`, toCsv(flat.columns, flat.rows, "Financial Report"), "text/csv;charset=utf-8");
        else downloadBlob(`${filename}.xlsx`, new Blob([await buildXlsx("Financial Report", flat.columns, flat.rows)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
        setStatus(action === "csv" ? "CSV report downloaded." : "Excel report downloaded.");
        return;
      }
      const bytes = await buildPdfReport(title, sections, data.period.farmName);
      if (action === "pdf") {
        downloadBlob(`${filename}.pdf`, new Blob([bytes], { type: "application/pdf" }));
        setStatus("PDF report downloaded.");
      } else {
        const outcome = await sharePdfFile(`${filename}.pdf`, bytes, title, `${data.period.farmName} · ${periodText(from, to)}`);
        setStatus(outcome === "shared" ? "Share sheet opened; check the file and recipient before sending." : outcome === "cancelled" ? "Sharing cancelled." : "File sharing is unavailable here; the PDF was downloaded.");
      }
    } catch (error) { setStatus(`Report export failed: ${friendlyError(error)}`); }
    finally { setBusy(null); }
  };

  const summary = data?.period.summary;
  const receivables = data ? receivableTotals(data.customers) : { due: 0, customerCredits: 0 };
  const pendingSalaries = data ? salaryPayableTotal(data.salaryPayables) : 0;
  const expenseGroups = data ? groupFinancialExpenses(data.period.expenses) : [];
  const incomeGroups = data ? groupOtherIncome(data.otherIncome) : [];
  const collectionGross = data?.period.customers.reduce((sum, customer) => sum + customer.paid, 0) ?? 0;
  const receivedTotal = collectionGross + (summary?.other_income ?? 0);
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
    <PageHeader title="Financial Report" sub="Farm income, expenses, cash movement, and outstanding balances" back="/reports/" />
    <Body className="space-y-4 pb-8">
      <Panel title="Report period" className="no-print">
        <div className="flex flex-wrap gap-2">{(Object.keys(presetLabels) as Preset[]).map((value) => <button
          type="button" key={value} aria-pressed={preset === value} onClick={() => choosePreset(value)}
          className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === value ? "border-ink bg-ink text-white" : "border-line"}`}
        >{presetLabels[value]}</button>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">From date<input aria-label="Financial report start date" type="date" value={from} max={to || today} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); setStatus(""); }} className={`${input} mt-1`} /></label>
          <label className="text-sm font-semibold">To date<input aria-label="Financial report end date" type="date" value={to} min={from || undefined} max={today} onChange={(event) => { setPreset("custom"); setTo(event.target.value); setStatus(""); }} className={`${input} mt-1`} /></label>
        </div>
        {!valid && <p role="alert" className="mt-3 text-sm text-udhaar">Choose a valid inclusive date range ending today or earlier, up to ten years.</p>}
        {valid && <p className="mt-3 text-sm text-muted">Showing both dates: <strong>{periodText(from, to)}</strong></p>}
      </Panel>

      {valid && report.isPending && <p role="status">Financial report is loading…</p>}
      {valid && report.isError && <p role="alert" className="text-udhaar">Report could not load: {friendlyError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">Retry</button></p>}
      {data && summary && <>
        <Panel title="Overview">
          <p className="mb-3 text-sm text-muted">Income and Farm Munafa follow the saved report rules. Receipts come from recorded customer payments and other income; account transfers are excluded.</p>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Total farm income", rs(summary.milk_income + summary.other_income), "Milk and other recorded income"],
              ["Cash received", rs(receivedTotal), "Customer payments + other income; no transfers"],
              ["Total expenses", rs(summary.farm_expenses + summary.home_expenses), "Farm and home/personal shown separately"],
              ["Farm profit / loss", rs(summary.profit), "Home/personal costs are excluded from Farm Munafa"],
              ["Customer receivables", rs(receivables.due), `At ${formatDay(to)}; customer credits ${rs(receivables.customerCredits)}`],
              ["Unpaid salaries", rs(pendingSalaries), `Salary records as of ${formatDay(to)}`],
            ].map(([label, value, detail]) => <div key={label} className="rounded-xl bg-ground p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd><dd className="mt-1 text-xs text-muted">{detail}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm text-muted">Supplier payables are unavailable because no supplier credit ledger is stored. Cost per litre is omitted because the app has no documented rule for allocating farm costs to milk.</p>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            {(["pdf", "excel", "csv", "print", "share"] as ExportAction[]).map((action) => <button key={action} type="button" disabled={busy !== null || !exportReady}
              onClick={() => void exportAction(action)} className={`min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-50 ${action === "share" ? "bg-berseem text-white" : "border-line"}`}>
              {action === "pdf" ? "PDF download" : action === "excel" ? "Excel export" : action === "csv" ? "CSV export" : action === "print" ? "Print" : "Share PDF"}
            </button>)}
          </div>
          {status && <p role={status.includes("failed") ? "alert" : "status"} className="mt-2 text-sm text-berseem-deep">{status}</p>}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Income by source">
            <p className="mb-3 text-sm text-muted">Billed sales and other recorded income are revenue. Customer payments are displayed separately and do not reduce billed income.</p>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-3 py-2"><dt>Milk deliveries and company bills (billed)</dt><dd className="font-semibold">{rs(summary.milk_income)}</dd></div>
              {incomeGroups.map((row) => <div key={row.kind} className="flex justify-between gap-3 py-2"><dt>{row.label}</dt><dd className="font-semibold">{rs(row.amount)}</dd></div>)}
              <div className="flex justify-between gap-3 border-t border-line py-2 font-bold"><dt>Total farm income</dt><dd>{rs(summary.milk_income + summary.other_income)}</dd></div>
            </dl>
            <h3 className="mt-4 font-semibold">Customer charges and payments</h3>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Customer", "Billed", "Payments", "Discounts", "Refunds"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.period.customers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2">{rs(row.charged)}</td><td className="border-b border-line px-2 py-2">{rs(row.paid)}</td><td className="border-b border-line px-2 py-2">{rs(row.discount)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.refund)}</td></tr>)}
            </tbody></table></div>
            {!data.period.customers.length && <p className="mt-2 text-sm text-muted">No customer charges or payments in this period.</p>}
            <h3 className="mt-4 font-semibold">Other income records</h3>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead><tr>{["Date", "Source", "Animal", "Note", "Amount"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.otherIncome.map((row) => <tr key={row.income_id}><td className="border-b border-line px-2 py-2">{row.income_date}</td><td className="border-b border-line px-2 py-2">{labelByIncome[row.kind] ?? row.kind}</td><td className="border-b border-line px-2 py-2">{row.animal_tag ?? "—"}</td><td className="border-b border-line px-2 py-2">{row.note ?? "—"}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.amount)}</td></tr>)}
            </tbody></table></div>
            {!data.otherIncome.length && <p className="mt-2 text-sm text-muted">No other income was recorded in this period.</p>}
          </Panel>

          <Panel title="Profit and loss">
            <p className="mb-3 text-sm text-muted">This statement follows `report_period_summary`: billed milk and company sales + other recorded income − farm costs. Home/personal costs do not reduce Farm Munafa.</p>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-3 py-2"><dt>Milk deliveries and company bills</dt><dd>{rs(summary.milk_income)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Other recorded income</dt><dd>{rs(summary.other_income)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Farm operating expenses</dt><dd>− {rs(summary.farm_expenses)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line py-2 text-lg font-bold"><dt>Net farm profit / loss</dt><dd>{rs(summary.profit)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt>Home / personal expenses (separate)</dt><dd>{rs(summary.home_expenses)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Salary is counted once when paid through the expense ledger. Pending salary below is a payable balance, not another P&amp;L expense. Expense rows include any inventory-linked Kharcha once; this report does not add separate inventory purchase totals.</p>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Expenses by recorded category">
            <p className="mb-3 text-sm text-muted">Farm categories stay in Farm Munafa. Home and personal categories are listed separately.</p>
            <div className="space-y-3">{expenseGroups.map((row) => <div key={`${row.classification}-${row.category}`}>
              <div className="mb-1 flex justify-between gap-2 text-sm"><span>{row.category} <span className="text-muted">· {row.classification} · {row.entries}</span></span><strong>{rs(row.amount)}</strong></div>
              <div className="h-2 rounded-full bg-ground"><div className={`h-2 rounded-full ${row.classification === "Farm" ? "bg-berseem" : "bg-udhaar"}`} style={{ width: `${Math.max(1, row.amount / maxExpense * 100)}%` }} /></div>
            </div>)}</div>
            {!expenseGroups.length && <p className="text-sm text-muted">No expenses were recorded in this period.</p>}
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Date", "Category / note", "Class", "Account", "Amount"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.period.expenses.map((row, index) => <tr key={`${row.expense_date}-${row.category}-${index}`}><td className="border-b border-line px-2 py-2">{row.expense_date}</td><td className="border-b border-line px-2 py-2">{row.category}{row.note ? ` · ${row.note}` : ""}</td><td className="border-b border-line px-2 py-2">{expenseType(row.is_farm_cost)}</td><td className="border-b border-line px-2 py-2">{row.account}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.amount)}</td></tr>)}
            </tbody></table></div>
          </Panel>

          <Panel title="Customer receivables">
            <p className="mb-3 text-sm text-muted">Closing balances come from the Khata ledger at {formatDay(to)}. Positive balances are dues; negative balances are customer credits.</p>
            <div className="mb-3 flex flex-wrap gap-4 text-sm"><strong>Receivable: {rs(receivables.due)}</strong><span>Customer credits: {rs(receivables.customerCredits)}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Customer", "Opening", "New opening", "Charges", "Payments", "Discounts", "Refunds", "Closing"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {data.customers.map((row) => <tr key={row.customer_id}><td className="border-b border-line px-2 py-2">{row.name}</td><td className="border-b border-line px-2 py-2">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2">{rs(row.opening_added)}</td><td className="border-b border-line px-2 py-2">{rs(row.charges)}</td><td className="border-b border-line px-2 py-2">{rs(row.payments)}</td><td className="border-b border-line px-2 py-2">{rs(row.discounts)}</td><td className="border-b border-line px-2 py-2">{rs(row.refunds)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td></tr>)}
            </tbody></table></div>
            {!data.customers.length && <p className="text-sm text-muted">No customer balances or activity in this period.</p>}
          </Panel>
        </div>

        <Panel title="Galla and account cash flow">
          <p className="mb-3 text-sm text-muted">Opening + received − paid + transfers in − transfers out = closing. Inflows/outflows include dated account openings in the selected period. Internal account transfers are separate and are not income or expenses.</p>
          {!allAccountsReconcile && <p role="alert" className="mb-3 text-udhaar">At least one account does not reconcile. Review its saved ledger entries.</p>}
          {allAccountsReconcile && <p role="status" className="mb-3 text-sm text-berseem-deep">All account closing balances reconcile with their ledger movements.</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-sm"><thead><tr>{["Account", "Opening", "Received", "Paid", "Transfers in", "Transfers out", "Closing"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.accounts.map((row) => <tr key={row.account_id}><td className="border-b border-line px-2 py-2">{row.account_name} <span className="text-muted">· {row.account_kind}</span></td><td className="border-b border-line px-2 py-2">{rs(row.opening_balance)}</td><td className="border-b border-line px-2 py-2">{rs(row.money_received)}</td><td className="border-b border-line px-2 py-2">{rs(row.money_paid)}</td><td className="border-b border-line px-2 py-2">{rs(row.transfers_in)}</td><td className="border-b border-line px-2 py-2">{rs(row.transfers_out)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.closing_balance)}</td></tr>)}
          </tbody>{accountTotals && <tfoot><tr className="font-bold"><td className="px-2 py-2">All accounts</td><td className="px-2 py-2">{rs(accountTotals.opening)}</td><td className="px-2 py-2">{rs(accountTotals.received)}</td><td className="px-2 py-2">{rs(accountTotals.paid)}</td><td className="px-2 py-2">{rs(accountTotals.transferIn)}</td><td className="px-2 py-2">{rs(accountTotals.transferOut)}</td><td className="px-2 py-2 text-right">{rs(accountTotals.closing)}</td></tr></tfoot>}</table></div>
          {!data.accounts.length && <p className="mt-2 text-sm text-muted">No account balances or movements in this period.</p>}
          {selectedAccount && <div className="mt-4 border-t border-line pt-4">
            <label className="block max-w-sm text-sm font-semibold">Ledger details<select aria-label="Account ledger details" value={selectedAccount.account_id} onChange={(event) => setSelectedAccountId(event.target.value)} className={`${input} mt-1`}>{data.accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.account_name}</option>)}</select></label>
            {ledger.isPending && <p role="status" className="mt-3 text-sm">Account entries are loading…</p>}
            {ledger.isError && <p role="alert" className="mt-3 text-sm text-udhaar">Account detail could not load: {friendlyError(ledger.error)} <button type="button" onClick={() => void ledger.refetch()} className="underline">Retry</button></p>}
            {ledger.data && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["Date", "Movement", "Description", "In", "Out"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
              {ledger.data.map((entry) => <tr key={entry.ref_id}><td className="border-b border-line px-2 py-2">{entry.entry_date}</td><td className="border-b border-line px-2 py-2">{entry.entry_kind.replaceAll("_", " ")}</td><td className="border-b border-line px-2 py-2">{entry.description}</td><td className="border-b border-line px-2 py-2">{entry.money_in ? rs(entry.money_in) : "—"}</td><td className="border-b border-line px-2 py-2 text-right">{entry.money_out ? rs(entry.money_out) : "—"}</td></tr>)}
            </tbody></table>{!ledger.data.length && <p className="mt-2 text-sm text-muted">No ledger entries for this account and period.</p>}</div>}
          </div>}
        </Panel>

        <Panel title="Pending salary payables">
          <p className="mb-3 text-sm text-muted">Agreed salary less linked expense payments recorded by {formatDay(to)}. Paid salary is already counted once in the expense ledger and Farm Munafa.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr>{["Staff", "Salary month", "Agreed", "Paid", "Pending"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.salaryPayables.filter((row) => row.outstanding_amount > 0).map((row) => <tr key={`${row.staff_id}-${row.salary_month}`}><td className="border-b border-line px-2 py-2">{row.staff_name}</td><td className="border-b border-line px-2 py-2">{formatMonth(row.salary_month)}</td><td className="border-b border-line px-2 py-2">{rs(row.agreed_amount)}</td><td className="border-b border-line px-2 py-2">{rs(row.paid_amount)}</td><td className="border-b border-line px-2 py-2 text-right font-semibold">{rs(row.outstanding_amount)}</td></tr>)}
          </tbody></table></div>
          {!data.salaryPayables.some((row) => row.outstanding_amount > 0) && <p className="text-sm text-muted">No pending salary payable is recorded as of this date.</p>}
        </Panel>

        <Panel title="Income, profit, and cash trends">
          <p className="mb-3 text-sm text-muted">Periods up to 90 days use daily buckets; longer periods use monthly buckets. Transfers are excluded from the cash chart; dated account-opening balances are included in cash received or paid.</p>
          <div className="grid gap-4 xl:grid-cols-2">
            <div><h3 className="mb-2 font-semibold">Farm income and operating expenses</h3><TrendBars rows={data.trends} from={from} to={to} /></div>
            <div><h3 className="mb-2 font-semibold">Account cash received and paid</h3><TrendBars rows={data.trends} from={from} to={to} cash /></div>
          </div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Bucket", "Farm income", "Farm expenses", "Home expenses", "Profit / loss", "Collections net refunds", "Cash in", "Cash out"].map((item) => <th key={item} className="border-b border-line px-2 py-2 text-left last:text-right">{item}</th>)}</tr></thead><tbody>
            {data.trends.map((row) => <tr key={row.bucket_start}><td className="border-b border-line px-2 py-2">{daysBetween(from, to) < 90 ? formatDay(row.bucket_start) : formatMonth(row.bucket_start)}</td><td className="border-b border-line px-2 py-2">{rs(row.total_income)}</td><td className="border-b border-line px-2 py-2">{rs(row.farm_expenses)}</td><td className="border-b border-line px-2 py-2">{rs(row.home_expenses)}</td><td className="border-b border-line px-2 py-2">{rs(row.net_profit)}</td><td className="border-b border-line px-2 py-2">{rs(row.customer_collections)}</td><td className="border-b border-line px-2 py-2">{rs(row.cash_received)}</td><td className="border-b border-line px-2 py-2 text-right">{rs(row.cash_paid)}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </>}
    </Body>
  </>;
}
