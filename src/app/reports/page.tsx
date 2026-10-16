"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchReport } from "@/lib/export-data";
import { getSettings } from "@/lib/settings";
import { formatMonth, todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import LogoMark from "@/components/LogoMark";
import { allRows, compareCustomers, type Customer } from "@/lib/farm-data";

const number = (value: unknown) => Number(value ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const cell = "border-b border-line px-2 py-1.5 text-right tabular-nums";

export default function ReportsPage() {
  const [month, setMonth] = useState(() => todayPK().slice(0, 7));
  const report = useQuery({
    queryKey: ["print-report", month],
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    queryFn: async () => {
      const [settings, customers, customerOrder, expenses, milk, pnl] = await Promise.all([
        getSettings(), fetchReport("customer_month_report", month), allRows<Customer>("customers"), fetchReport("expense_month_report", month),
        fetchReport("milk_month_summary", month), fetchReport("pnl_month", month),
      ]);
      const order = new Map(customerOrder.map((customer) => [customer.id, customer]));
      customers.sort((a, b) => compareCustomers(
        order.get(String(a.customer_id)) ?? { id: String(a.customer_id), name: String(a.name), sort_order: 0 },
        order.get(String(b.customer_id)) ?? { id: String(b.customer_id), name: String(b.name), sort_order: 0 },
      ));
      return { settings, customers, expenses, milk: milk[0], pnl: pnl[0] };
    },
  });
  const data = report.data;
  return <div className="print-report mx-auto max-w-5xl bg-paper p-4 sm:p-8">
    <div className="no-print mb-5 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
      <Link href="/settings/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 font-semibold sm:w-auto">Settings par wapas</Link>
      <label className="grid gap-1 text-sm font-semibold">Report ka maheena<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="min-h-11 w-full rounded-xl border border-line px-3 sm:w-auto" /></label>
      <button type="button" disabled={!data || report.isFetching} onClick={() => window.print()} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Print / PDF save karein</button>
    </div>
    {report.isPending && <p role="status">Report load ho rahi hai…</p>}
    {report.isError && <p role="alert" className="text-udhaar">Report nahi khuli: {friendlyError(report.error)} <button onClick={() => void report.refetch()} className="underline">Dobara koshish</button></p>}
    {data && <>
      <header className="mb-6 min-w-0 border-b-2 border-ink pb-3">
        <div className="flex min-w-0 items-center gap-3"><LogoMark size={48} /><h1 className="min-w-0 break-words font-display text-xl font-bold leading-tight sm:text-2xl">{data.settings.farm_name}</h1></div>
        <p className="mt-2 font-semibold">{formatMonth(`${month}-01`)} ki report</p>
        <p className="text-sm text-muted">Farm ke records se banayi gayi</p>
      </header>
      <section className="mb-6"><h2 className="mb-2 font-display text-lg font-bold">Customer ka hisaab</h2><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr><th className="border-b border-line px-2 py-1.5 text-left">Naam</th>{["Doodh (L)", "Kul raqam (Rs)", "Pichla baqaya (Rs)", "Total (Rs)", "Ada shuda (Rs)", "Riayat (Rs)", "Baqaya (Rs)"].map((title) => <th key={title} className={cell}>{title}</th>)}</tr></thead><tbody>{data.customers.map((row) => <tr key={String(row.customer_id)}><td className="border-b border-line px-2 py-1.5">{String(row.name)}</td>{["litres", "amount", "previous_balance", "total", "paid", "discount", "balance"].map((key) => <td key={key} className={cell}>{number(row[key])}</td>)}</tr>)}</tbody></table>{data.customers.length === 0 && <p className="mt-2 text-sm text-muted">Is maheene ka customer data nahi hai.</p>}</div></section>
      <section className="mb-6 grid gap-5 sm:grid-cols-2"><div><h2 className="mb-2 font-display text-lg font-bold">Kharchay ki tafseel</h2><table className="w-full text-sm"><thead><tr><th className="border-b border-line px-2 py-1.5 text-left">Tafseel</th><th className={cell}>Raqam (Rs)</th></tr></thead><tbody>{data.expenses.map((row, index) => <tr key={`${row.category_id}-${row.staff_id}-${index}`}><td className="border-b border-line px-2 py-1.5">{String(row.label)}</td><td className={cell}>{number(row.amount)}</td></tr>)}</tbody></table>{data.expenses.length === 0 && <p className="mt-2 text-sm text-muted">Is maheene ka kharcha nahi hai.</p>}</div>
        <div><h2 className="mb-2 font-display text-lg font-bold">Doodh aur munafa</h2><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt>Paida hua doodh (L)</dt><dd className="text-right">{number(data.milk?.produced)}</dd><dt>Diya gaya doodh (L)</dt><dd className="text-right">{number(data.milk?.delivered)}</dd><dt>Farq (L)</dt><dd className="text-right">{number(data.milk?.difference)}</dd><dt>Doodh ki aamdani (Rs)</dt><dd className="text-right">{number(data.pnl?.milk_income)}</dd><dt>Doosri aamdani (Rs)</dt><dd className="text-right">{number(data.pnl?.other_income)}</dd><dt>Farm kharchay (Rs)</dt><dd className="text-right">{number(data.pnl?.farm_expenses)}</dd><dt>Zaati kharchay (Rs)</dt><dd className="text-right">{number(data.pnl?.personal_expenses)}</dd><dt className="border-t border-line pt-2 font-bold">Munafa ya nuqsan (Rs)</dt><dd className="border-t border-line pt-2 text-right font-bold">{number(data.pnl?.profit)}</dd></dl></div></section>
    </>}
  </div>;
}
