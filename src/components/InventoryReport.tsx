"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Body, PageHeader, Panel } from "./ui";
import { buildPdfReport, downloadBlob, toCsv } from "@/lib/export-data";
import { friendlyError } from "@/lib/errors";
import { rs } from "@/lib/format";
import { formatDay, todayPK } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import {
  getInventoryItems, getInventoryReportSummary, getInventoryReportTransactions, getInventoryReportUsage,
  INVENTORY_UNIT_LABEL, loadInventoryReportStaff, loadInventorySetup,
  type InventoryReportSummary, type InventoryReportTransaction, type InventoryReportUsage,
} from "@/lib/farm-inventory";
import {
  buildInventoryReportWorkbook, inventoryReportExportSections, inventoryReportMovementLabel, inventoryReportRange,
  isInventoryReportDateRange, INVENTORY_REPORT_TRANSACTION_COLUMNS, type InventoryReportPreset,
} from "@/lib/inventory-report";

type EmployeeFilter = "all" | "general" | string;
type ExportAction = "pdf" | "csv" | "excel" | "print";
type PrintSnapshot = { summary: InventoryReportSummary[]; usage: InventoryReportUsage[]; movements: InventoryReportTransaction[] };
const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const pageSize = 50;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(Number(value || 0));
const unitName = (unit: string) => INVENTORY_UNIT_LABEL[unit as keyof typeof INVENTORY_UNIT_LABEL] ?? unit;
const filenameDate = (value: string) => value.replaceAll("-", "");

export default function InventoryReport() {
  const today = todayPK();
  const initialRange = inventoryReportRange("month", today);
  const [preset, setPreset] = useState<InventoryReportPreset>("month");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilter>("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [status, setStatus] = useState("");
  const [printSnapshot, setPrintSnapshot] = useState<PrintSnapshot | null>(null);
  const valid = isInventoryReportDateRange(from, to, today);
  const searchValue = search.trim();
  const staffId = employeeFilter !== "all" && employeeFilter !== "general" ? employeeFilter : null;
  const generalOnly = employeeFilter === "general";

  const items = useQuery({ queryKey: ["inventory", "items"], queryFn: getInventoryItems, staleTime: 60_000 });
  const setup = useQuery({ queryKey: ["inventory", "setup"], queryFn: loadInventorySetup, staleTime: 60_000 });
  const staff = useQuery({ queryKey: ["inventory-report", "staff"], queryFn: loadInventoryReportStaff, staleTime: 60_000 });
  const settings = useQuery({ queryKey: ["farm-settings"], queryFn: getSettings, staleTime: 60_000 });
  const summary = useQuery({
    queryKey: ["inventory-report", "summary", from, to, itemFilter, categoryFilter], enabled: valid,
    queryFn: () => getInventoryReportSummary(from, to, itemFilter === "all" ? null : itemFilter,
      categoryFilter === "all" ? null : categoryFilter),
  });
  const usage = useQuery({
    queryKey: ["inventory-report", "usage", from, to, itemFilter, categoryFilter, employeeFilter], enabled: valid,
    queryFn: () => getInventoryReportUsage(from, to, itemFilter === "all" ? null : itemFilter,
      categoryFilter === "all" ? null : categoryFilter, staffId, generalOnly),
  });
  const movements = useQuery({
    queryKey: ["inventory-report", "movements", from, to, itemFilter, categoryFilter, employeeFilter, searchValue, page], enabled: valid,
    queryFn: () => getInventoryReportTransactions({ from, to,
      itemId: itemFilter === "all" ? null : itemFilter, categoryId: categoryFilter === "all" ? null : categoryFilter,
      staffId, unassigned: generalOnly, search: searchValue, limit: pageSize, offset: page * pageSize }),
  });

  const summaryRows = (summary.data ?? []).filter((row) =>
    !searchValue || `${row.item_name} ${row.category_name}`.toLocaleLowerCase().includes(searchValue.toLocaleLowerCase()));
  const usageRows = (usage.data ?? []).filter((row) =>
    !searchValue || `${row.item_name} ${row.category_name} ${row.staff_name ?? "General farm use"}`.toLocaleLowerCase().includes(searchValue.toLocaleLowerCase()));
  const transactionRows = movements.data ?? [];
  const totalTransactions = Number(transactionRows[0]?.matched_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));
  const lowCount = summaryRows.filter((row) => row.current_low_stock).length;
  const outCount = summaryRows.filter((row) => row.current_out_of_stock).length;
  const purchaseTotal = summaryRows.reduce((total, row) => total + Number(row.purchase_amount), 0);
  const hasFilter = searchValue.length > 0 || itemFilter !== "all" || categoryFilter !== "all" || employeeFilter !== "all";
  const employeeLabel = employeeFilter === "all" ? "All employees / usage" : employeeFilter === "general"
    ? "General farm use (unassigned)" : staff.data?.find((entry) => entry.id === employeeFilter)?.name ?? "Selected employee";
  const exportFilters = [
    searchValue ? `Search: ${searchValue}` : "",
    itemFilter !== "all" ? `Item: ${items.data?.find((item) => item.id === itemFilter)?.name ?? "Selected item"}` : "",
    categoryFilter !== "all" ? `Category: ${setup.data?.categories.find((entry) => entry.id === categoryFilter)?.name ?? "Selected category"}` : "",
    employeeFilter !== "all" ? `Usage: ${employeeLabel}` : "",
  ].filter(Boolean);
  const exportContext = {
    from, to, filters: exportFilters,
    balanceScope: employeeFilter === "all"
      ? "Balances and purchase totals are farm-wide per item. Usage and movements follow the selected item, category, and search filters."
      : "Opening/closing balances and purchase totals are farm-wide per item; usage and movements are filtered to the selected employee.",
  };

  useEffect(() => {
    if (!printSnapshot) return;
    const timer = window.setTimeout(() => window.print(), 120);
    return () => window.clearTimeout(timer);
  }, [printSnapshot]);

  useEffect(() => {
    const cleanup = () => setPrintSnapshot(null);
    window.addEventListener("afterprint", cleanup);
    return () => window.removeEventListener("afterprint", cleanup);
  }, []);

  const choosePeriod = (value: InventoryReportPreset) => {
    setPreset(value); setStatus(""); setPage(0);
    if (value !== "custom") {
      const range = inventoryReportRange(value, today);
      setFrom(range.from); setTo(range.to);
    }
  };
  const updateFilter = (change: () => void) => { change(); setPage(0); setStatus(""); };

  const loadAllMovements = async () => {
    const rows: InventoryReportTransaction[] = [];
    let expectedCount = 0;
    for (let offset = 0; offset <= 100_000; offset += 200) {
      const batch = await getInventoryReportTransactions({ from, to,
        itemId: itemFilter === "all" ? null : itemFilter, categoryId: categoryFilter === "all" ? null : categoryFilter,
        staffId, unassigned: generalOnly, search: searchValue, limit: 200, offset });
      if (offset === 0) expectedCount = Number(batch[0]?.matched_count ?? 0);
      rows.push(...batch);
      if (batch.length < 200) break;
      if (offset === 100_000) throw new Error("This export is too large. Narrow the date or item filter and try again.");
    }
    if (rows.length !== expectedCount) throw new Error("The full movement list could not be loaded. Narrow the date or item filter and try again.");
    return rows;
  };

  const exportReport = async (action: ExportAction) => {
    if (!valid || !summary.data || !usage.data) return;
    setBusy(action); setStatus("");
    try {
      const allMovements = await loadAllMovements();
      if (action === "csv") {
        const csvRows = allMovements.map((row) => ({ ...row,
          movement_type: inventoryReportMovementLabel(row.movement_type),
          staff_name: row.staff_name ?? (row.movement_type === "usage" ? "General farm use" : "—"),
        }));
        downloadBlob(`inventory-movements-${filenameDate(from)}-${filenameDate(to)}.csv`,
          new Blob([toCsv(INVENTORY_REPORT_TRANSACTION_COLUMNS, csvRows, "Inventory Report")], { type: "text/csv;charset=utf-8" }));
        setStatus("Filtered inventory movements downloaded as CSV.");
      } else if (action === "excel") {
        const workbook = await buildInventoryReportWorkbook(summaryRows, usageRows, allMovements, exportContext);
        downloadBlob(`inventory-report-${filenameDate(from)}-${filenameDate(to)}.xlsx`,
          new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        setStatus("Filtered inventory report downloaded as an Excel workbook.");
      } else if (action === "pdf") {
        const sections = inventoryReportExportSections(summaryRows, usageRows, allMovements, exportContext);
        const bytes = await buildPdfReport(`Inventory Report — ${from} to ${to}`, sections, settings.data?.farm_name ?? "Dairy farm");
        downloadBlob(`inventory-report-${filenameDate(from)}-${filenameDate(to)}.pdf`, new Blob([bytes], { type: "application/pdf" }));
        setStatus("Filtered inventory report downloaded as PDF.");
      } else {
        setPrintSnapshot({ summary: summaryRows, usage: usageRows, movements: allMovements });
        setStatus("Print view is ready.");
      }
    } catch (error) {
      setStatus(`Export could not be prepared: ${friendlyError(error)}`);
    } finally { setBusy(null); }
  };

  const retryAll = () => { void summary.refetch(); void usage.refetch(); void movements.refetch(); void items.refetch(); void setup.refetch(); void staff.refetch(); };
  const reportError = summary.error ?? usage.error ?? movements.error ?? items.error ?? setup.error ?? staff.error;
  const exportDisabled = !valid || busy !== null || summary.isLoading || usage.isLoading || movements.isLoading
    || items.isLoading || setup.isLoading || staff.isLoading || !!reportError;
  const itemOptions = items.data ?? [];

  return <>
    <div className="print:hidden"><PageHeader title="Inventory Report" sub="Read-only stock balances and movement history." back="/reports/" /></div>
    <Body className="space-y-4 pb-8 print:hidden">
      <Panel title="Report period">
        <div className="flex flex-wrap gap-2">
          {(["today", "yesterday", "week", "month", "year", "custom"] as const).map((key) => (
            <button key={key} type="button" aria-pressed={preset === key} onClick={() => choosePeriod(key)}
              className={`min-h-11 rounded-xl border px-3 font-semibold ${preset === key ? "border-ink bg-ink text-white" : "border-line"}`}>
              {({ today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", year: "This year", custom: "Custom range" } as const)[key]}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">From date<input aria-label="Inventory report from date" type="date" value={from} max={to || today}
            onChange={(event) => { setPreset("custom"); setFrom(event.target.value); setPage(0); }} className={`${field} mt-1`} /></label>
          <label className="text-sm font-semibold">Through date<input aria-label="Inventory report through date" type="date" value={to} min={from} max={today}
            onChange={(event) => { setPreset("custom"); setTo(event.target.value); setPage(0); }} className={`${field} mt-1`} /></label>
        </div>
        <p className="mt-2 text-sm text-muted">Showing {from ? formatDay(from) : "—"} through {to ? formatDay(to) : "—"}, inclusive.</p>
        {!valid && <p role="alert" className="mt-2 text-sm text-udhaar">Choose dates in order, through today, within 10 years.</p>}
      </Panel>

      <Panel title="Search and filters">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">Search items and movements<input value={search} maxLength={120} onChange={(event) => updateFilter(() => setSearch(event.target.value))}
            placeholder="Item, supplier, invoice, purpose…" className={field} /></label>
          <label className="text-sm">Inventory item<select value={itemFilter} onChange={(event) => updateFilter(() => setItemFilter(event.target.value))} className={field}>
            <option value="all">All items</option>{itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactive)"}</option>)}
          </select></label>
          <label className="text-sm">Category<select value={categoryFilter} onChange={(event) => updateFilter(() => setCategoryFilter(event.target.value))} className={field}>
            <option value="all">All categories</option>{(setup.data?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}
          </select></label>
          <label className="text-sm">Issued to<select value={employeeFilter} onChange={(event) => updateFilter(() => setEmployeeFilter(event.target.value))} className={field}>
            <option value="all">All employees / usage</option><option value="general">General farm use (unassigned)</option>
            {(staff.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.active ? "" : " (inactive)"}</option>)}
          </select></label>
        </div>
        {hasFilter && <button type="button" onClick={() => { setSearch(""); setItemFilter("all"); setCategoryFilter("all"); setEmployeeFilter("all"); setPage(0); }} className="mt-3 min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Clear filters</button>}
        {employeeFilter !== "all" && <p className="mt-2 text-xs text-muted">The employee filter narrows issue transactions and usage totals. Item balances and purchase totals remain whole-farm ledger values.</p>}
      </Panel>

      {reportError && <p role="alert" className="rounded-xl bg-udhaar-soft p-4 text-sm text-udhaar">Inventory report could not be loaded: {friendlyError(reportError)} <button type="button" onClick={retryAll} className="font-semibold underline">Try again</button></p>}
      {(summary.isLoading || usage.isLoading || movements.isLoading || items.isLoading || setup.isLoading || staff.isLoading)
        && <p role="status" className="text-sm text-muted">Loading inventory report…</p>}

      {!reportError && summary.data && <>
        <section aria-label="Inventory report summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[ ["Items in view", String(summaryRows.length)], ["Items with purchases", String(summaryRows.filter((row) => Number(row.purchases_in) > 0).length)],
            ["Purchase amount", rs(purchaseTotal)], ["Low stock now", String(lowCount)], ["Out of stock now", String(outCount)] ].map(([title, value]) => (
            <div key={title} className="rounded-2xl border border-line bg-paper p-3 sm:p-4"><p className="text-xs text-muted">{title}</p><strong className="mt-1 block font-display text-lg">{value}</strong></div>
          ))}
        </section>

        <Panel title="Item-wise stock balances">
          <p className="mb-3 text-sm text-muted">Each row stays in that item’s stock unit. No kilograms, litres, bags, or pieces are combined into one total.</p>
          <p className="mb-3 text-xs text-muted">Closing stock = opening + initial stock + purchases + positive adjustments − usage − negative adjustments − wastage. Today’s current stock is shown separately from the selected period.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm">
            <thead><tr>{["Item", "Unit", "Opening", "Initial added", "Purchased", "Used / issued", "Adjustment +", "Adjustment −", "Wastage", "Closing", "Purchase Rs", "Current stock"].map((heading) => <th key={heading} className="border-b border-line px-2 py-2 text-right first:text-left">{heading}</th>)}</tr></thead>
            <tbody>{summaryRows.map((row) => <tr key={row.item_id}>
              <td className="border-b border-line px-2 py-2"><button type="button" onClick={() => { setItemFilter(row.item_id); setPage(0); }} className="font-semibold text-berseem-deep underline">{row.item_name}</button><span className="block text-xs text-muted">{row.category_name}</span></td>
              <td className="border-b border-line px-2 py-2 text-right">{unitName(row.stock_unit)}</td>
              {[row.opening_stock, row.opening_entries_in, row.purchases_in, row.usage_out, row.adjustment_in, row.adjustment_out, row.wastage_out, row.closing_stock].map((value, index) => <td key={index} className="border-b border-line px-2 py-2 text-right">{number(value)}</td>)}
              <td className="border-b border-line px-2 py-2 text-right">{rs(row.purchase_amount)}</td>
              <td className="border-b border-line px-2 py-2 text-right"><span>{number(row.current_stock)} {unitName(row.stock_unit)}</span><span className={`block text-xs ${row.current_out_of_stock ? "text-udhaar" : row.current_low_stock ? "text-haldi-ink" : "text-berseem-deep"}`}>{row.current_out_of_stock ? "Out of stock" : row.current_low_stock ? "Low stock" : "In stock"}</span></td>
            </tr>)}</tbody>
          </table></div>
          {!summaryRows.length && <p className="mt-3 text-sm text-muted">No inventory items match these filters.</p>}
        </Panel>

        <Panel title="Employee-wise usage">
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm">
            <thead><tr>{["Item", "Category", "Employee / attribution", "Quantity", "Transactions", "Details"].map((heading) => <th key={heading} className="border-b border-line px-2 py-2 text-left">{heading}</th>)}</tr></thead>
            <tbody>{usageRows.map((row) => <tr key={`${row.item_id}:${row.staff_id ?? "unassigned"}`}>
              <td className="border-b border-line px-2 py-2">{row.item_name}</td><td className="border-b border-line px-2 py-2">{row.category_name}</td>
              <td className="border-b border-line px-2 py-2">{row.staff_name ?? "General farm use (unassigned)"}</td>
              <td className="border-b border-line px-2 py-2">{number(row.total_quantity)} {unitName(row.stock_unit)}</td>
              <td className="border-b border-line px-2 py-2">{row.transaction_count}</td>
              <td className="border-b border-line px-2 py-2"><button type="button" onClick={() => { setItemFilter(row.item_id); setEmployeeFilter(row.staff_id ?? "general"); setPage(0); }} className="min-h-9 rounded-lg border border-line px-2 font-semibold">View issues</button></td>
            </tr>)}</tbody>
          </table></div>
          {!usage.isLoading && !usage.error && !usageRows.length && <p className="mt-3 text-sm text-muted">No usage was recorded in this period.</p>}
          <p className="mt-2 text-xs text-muted">Usage value is unavailable: stock issues do not record a reliable cost basis.</p>
        </Panel>

        <Panel title="Dated stock movements">
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm">
            <thead><tr>{["Date", "Movement", "Item", "Quantity entered", "Stock change", "Balance after", "Employee / details", "Purchase Rs", "Account / Kharcha", "Batch / reference", "Recorded by"].map((heading) => <th key={heading} className="border-b border-line px-2 py-2 text-left">{heading}</th>)}</tr></thead>
            <tbody>{transactionRows.map((row) => <tr key={row.movement_id}>
              <td className="border-b border-line px-2 py-2 whitespace-nowrap">{formatDay(row.movement_date)}</td><td className="border-b border-line px-2 py-2">{inventoryReportMovementLabel(row.movement_type)}</td>
              <td className="border-b border-line px-2 py-2">{row.item_name}<span className="block text-xs text-muted">{row.category_name}</span></td>
              <td className="border-b border-line px-2 py-2 whitespace-nowrap">{number(row.entered_quantity)} {unitName(row.entered_unit)}</td>
              <td className={`border-b border-line px-2 py-2 whitespace-nowrap ${row.quantity_delta < 0 ? "text-udhaar" : "text-berseem-deep"}`}>{row.quantity_delta > 0 ? "+" : "−"}{number(Math.abs(row.quantity_delta))} {unitName(row.stock_unit)}</td>
              <td className="border-b border-line px-2 py-2 whitespace-nowrap">{number(row.running_balance_after)} {unitName(row.stock_unit)}</td>
              <td className="border-b border-line px-2 py-2">{row.staff_name ?? (row.movement_type === "usage" ? "General farm use (unassigned)" : "—")}<span className="block text-xs text-muted">{[row.purpose, row.reason, row.note].filter(Boolean).join(" · ")}</span></td>
              <td className="border-b border-line px-2 py-2 whitespace-nowrap">{row.total_amount === null ? "—" : `${rs(row.total_amount)}${row.unit_rate === null ? "" : ` · ${rs(row.unit_rate)}/${unitName(row.entered_unit)}`}`}</td>
              <td className="border-b border-line px-2 py-2">{row.account_name ?? "—"}{row.expense_id && <span className="block text-xs text-muted" title={row.expense_id}>Kharcha · {row.expense_id.slice(0, 8)}</span>}</td>
              <td className="border-b border-line px-2 py-2">{[row.supplier, row.batch_code, row.reference, row.expiry_date].filter(Boolean).join(" · ") || "—"}</td>
              <td className="border-b border-line px-2 py-2" title={row.actor_id ?? undefined}>{row.actor_id ? row.actor_id.slice(0, 8) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
          {!movements.isLoading && !movements.error && !transactionRows.length && <p className="mt-3 text-sm text-muted">No inventory movements match this period and these filters.</p>}
          {movements.isError && <p role="alert" className="mt-3 text-sm text-udhaar">Movement details could not be loaded: {friendlyError(movements.error)} <button type="button" onClick={() => void movements.refetch()} className="underline">Try again</button></p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{totalTransactions ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalTransactions)} of ${totalTransactions} filtered movements` : "0 filtered movements"}</p>
            <div className="flex gap-2"><button type="button" disabled={page === 0 || movements.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-10 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Previous</button>
              <button type="button" disabled={page + 1 >= totalPages || movements.isFetching} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-xl border border-line px-3 font-semibold disabled:opacity-50">Next</button></div>
          </div>
        </Panel>

        <Panel title="Export and print">
          <div className="flex flex-wrap gap-2">
            {([ ["pdf", "PDF download"], ["csv", "CSV (Excel compatible)"], ["excel", "Excel workbook"], ["print", "Print"] ] as const).map(([action, label]) => (
              <button key={action} type="button" disabled={exportDisabled} onClick={() => void exportReport(action)} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">
                {busy === action ? "Preparing…" : label}
              </button>
            ))}
          </div>
          {status && <p role="status" className="mt-3 text-sm text-berseem-deep">{status}</p>}
          <p className="mt-2 text-xs text-muted">Exports include the selected date range, item/category/search filters, and employee issue filter. Excel and PDF include item balances, usage attribution, and matching movements.</p>
        </Panel>
      </>}
    </Body>

    {printSnapshot && <main className="hidden p-6 text-ink print:block">
      <h1 className="text-2xl font-bold">{settings.data?.farm_name ?? "Dairy farm"} — Inventory Report</h1>
      <p className="mt-1 text-sm">{from} through {to} · Printed {today}</p>
      {hasFilter && <p className="mt-1 text-xs">Filters: {searchValue || ""} {itemFilter !== "all" ? `· Item ${items.data?.find((item) => item.id === itemFilter)?.name ?? "Selected"}` : ""} {categoryFilter !== "all" ? `· ${setup.data?.categories.find((entry) => entry.id === categoryFilter)?.name ?? "Category"}` : ""} {employeeFilter !== "all" ? `· ${employeeFilter === "general" ? "General farm use" : staff.data?.find((entry) => entry.id === employeeFilter)?.name ?? "Employee"}` : ""}</p>}
      {employeeFilter !== "all" && <p className="mt-1 text-xs">Balances and purchase totals remain farm-wide per item; usage and movements follow the selected employee.</p>}
      <h2 className="mt-5 font-bold">Item-wise stock balances</h2>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><thead><tr>{["Item", "Unit", "Opening", "Initial added", "Purchased", "Used", "Adjustment +", "Adjustment −", "Wastage", "Closing", "Purchase Rs", "Current stock"].map((heading) => <th key={heading} className="border border-line p-1 text-left">{heading}</th>)}</tr></thead>
        <tbody>{printSnapshot.summary.map((row) => <tr key={row.item_id}><td className="border border-line p-1">{row.item_name} · {row.category_name}</td><td className="border border-line p-1">{unitName(row.stock_unit)}</td>{[row.opening_stock,row.opening_entries_in,row.purchases_in,row.usage_out,row.adjustment_in,row.adjustment_out,row.wastage_out,row.closing_stock].map((value,index)=><td key={index} className="border border-line p-1">{number(value)}</td>)}<td className="border border-line p-1">{rs(row.purchase_amount)}</td><td className="border border-line p-1">{number(row.current_stock)} {unitName(row.stock_unit)}</td></tr>)}</tbody></table></div>
      <h2 className="mt-5 font-bold">Employee-wise usage</h2>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><thead><tr>{["Item", "Employee", "Quantity", "Transactions"].map((heading) => <th key={heading} className="border border-line p-1 text-left">{heading}</th>)}</tr></thead>
        <tbody>{printSnapshot.usage.map((row) => <tr key={`${row.item_id}:${row.staff_id ?? "unassigned"}`}><td className="border border-line p-1">{row.item_name}</td><td className="border border-line p-1">{row.staff_name ?? "General farm use (unassigned)"}</td><td className="border border-line p-1">{number(row.total_quantity)} {unitName(row.stock_unit)}</td><td className="border border-line p-1">{row.transaction_count}</td></tr>)}</tbody></table></div>
      <h2 className="mt-5 font-bold">Dated movements</h2>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><thead><tr>{["Date", "Type", "Item", "Qty", "Balance", "Employee / details", "Purchase Rs", "Account", "Reference / batch"].map((heading) => <th key={heading} className="border border-line p-1 text-left">{heading}</th>)}</tr></thead>
        <tbody>{printSnapshot.movements.map((row) => <tr key={row.movement_id}><td className="border border-line p-1">{formatDay(row.movement_date)}</td><td className="border border-line p-1">{inventoryReportMovementLabel(row.movement_type)}</td><td className="border border-line p-1">{row.item_name}</td><td className="border border-line p-1">{number(row.entered_quantity)} {unitName(row.entered_unit)}</td><td className="border border-line p-1">{number(row.running_balance_after)} {unitName(row.stock_unit)}</td><td className="border border-line p-1">{row.staff_name ?? (row.movement_type === "usage" ? "General farm use" : "—")} · {[row.purpose,row.reason,row.note].filter(Boolean).join(" · ")}</td><td className="border border-line p-1">{row.total_amount === null ? "—" : rs(row.total_amount)}</td><td className="border border-line p-1">{row.account_name ?? "—"}</td><td className="border border-line p-1">{[row.supplier,row.reference,row.batch_code,row.expiry_date].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div>
      <p className="mt-4 text-xs">Usage value is not estimated because the ledger does not record an issue cost basis.</p>
    </main>}
  </>;
}
