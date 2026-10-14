"use client";

import { useState, type FormEvent } from "react";
import { friendlyError } from "@/lib/errors";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  amount, createCustomer, customerMonthReport, customerRate, insertRow, money, recordCustomerPayment,
  saveCustomerRate, updateCustomerProfile,
  shortDate, useFarmData, type Customer, type FarmData,
} from "@/lib/farm-data";
import {
  parseCompanyBill, parseCustomerPayment, parseCustomerProfile, parseCustomerRate, parseNewCustomer,
  type CustomerKind,
} from "@/lib/customer-forms";
import {
  buildCustomerStatementPdf, buildPaymentReceiptPdf, documentFilename, receiptMessage,
  shareCustomerPdf, statementLines, statementMessage,
} from "@/lib/customer-documents";
import { whatsappNumber } from "@/lib/phone";
import { downloadBlob } from "@/lib/export-data";
import { formatMonth } from "@/lib/dates";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { PlusIcon } from "./icons";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
type Save = (action: () => Promise<void>, message: string) => Promise<boolean>;

function CustomerDetail({ data, customer, save, busy, error, success }: {
  data: FarmData; customer: Customer; save: Save; busy: boolean; error: string; success: string;
}) {
  const c = customer;
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= data.today.slice(0, 7);
  const [editing, setEditing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const reportQuery = useQuery({
    queryKey: ["customer-report", c.id, month],
    queryFn: () => customerMonthReport(c.id, month),
    enabled: validMonth,
  });
  const balance = amount(data.balances.find((x) => x.customer_id === c.id)?.balance);
  const report = reportQuery.data;
  const rate = customerRate(data, c.id);
  const ledger = statementLines(data, c.id, month);
  const phone = whatsappNumber(c.phone);
  const wa = phone && report ? `https://wa.me/${phone}?text=${encodeURIComponent(statementMessage(data.settings, c, month, report))}` : null;
  const activeAccounts = data.accounts.filter((account) => account.active);
  const onProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void save(() => updateCustomerProfile(c.id, parseCustomerProfile(values)), "Customer ki maloomat save ho gayi.")
      .then((saved) => { if (saved) setEditing(false); });
  };
  const onPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void save(async () => {
      await recordCustomerPayment(c.id, parseCustomerPayment(values, data.today));
      form.reset();
    }, "Wusooli save ho gayi. Neeche register se receipt share karein.");
  };
  const onRate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void save(() => {
      const input = parseCustomerRate(values, data.today, c.opening_date);
      return saveCustomerRate(c.id, input.rate, input.date);
    }, "Naya rate save ho gaya.");
  };
  const onCompanyBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void save(async () => {
      const input = parseCompanyBill(values, data.today);
      await insertRow("company_bills", {
        customer_id: c.id, from_date: input.from, to_date: input.to,
        litres: input.litres, amount: input.amount,
      });
      form.reset();
    }, "Company bill save ho gaya.");
  };

  const document = async (kind: "bill" | "receipt", paymentId: string | null, share: boolean) => {
    setPdfBusy(true); setPdfStatus("");
    try {
      const payment = data.payments.find((item) => item.id === paymentId && item.customer_id === c.id);
      if (kind === "bill" && !report) throw new RangeError("Is maheene ka bill abhi load nahi hua.");
      if (kind === "receipt" && (!payment || payment.kind !== "payment")) throw new RangeError("Wusooli ka record nahi mila.");
      const bytes = kind === "bill"
        ? await buildCustomerStatementPdf({ farm: data.settings, customer: c, month, report: report!, lines: ledger })
        : await buildPaymentReceiptPdf({ farm: data.settings, customer: c, payment: payment! });
      const filename = documentFilename(c, kind, kind === "bill" ? month : payment!.id);
      if (share) {
        const message = kind === "bill" ? statementMessage(data.settings, c, month, report!) : receiptMessage(data.settings, c, payment!);
        const outcome = await shareCustomerPdf(filename, bytes, `${data.settings.farm_name} - ${c.name}`, message);
        setPdfStatus(outcome === "downloaded" ? "PDF download ho gaya. WhatsApp khol kar file attach karein." : outcome === "shared" ? "Share sheet band hui. WhatsApp mein bhejna check karein." : "Share cancel ho gaya.");
      } else {
        downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
        setPdfStatus("PDF download ho gaya.");
      }
    } catch (issue) { setPdfStatus(`PDF nahi bana: ${friendlyError(issue)}`); }
    finally { setPdfBusy(false); }
  };

  return <>
    <PageHeader title={c.name} sub={`${c.active ? "Active" : "Band"} · ${c.phone || "Phone darj nahi"} · Subah ${amount(c.default_morning)} L · Shaam ${amount(c.default_evening)} L${rate ? ` · ${money(rate)}/L` : ""}`} back="/khata/" />
    <Body className="grid gap-4 lg:grid-cols-2">
      <section className={`rounded-2xl p-5 text-white ${balance > 0 ? "bg-udhaar" : "bg-berseem"}`}>
        <p className="text-white/80">{balance > 0 ? "Baqi raqam" : balance < 0 ? "Customer ka advance" : "Hisaab saaf"}</p>
        <p className="font-display text-[44px] font-extrabold">{money(Math.abs(balance))}</p>
      </section>
      <Panel title="Customer ki maloomat">
        <button type="button" onClick={() => setEditing(!editing)} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem">{editing ? "Form band karein" : "Maloomat badlein"}</button>
        {editing && <form onSubmit={onProfile} className="mt-3 grid gap-2">
          <label className="text-sm font-semibold">Naam<input name="name" required defaultValue={c.name} className={field} /></label>
          <label className="text-sm font-semibold">Phone<input name="phone" type="tel" defaultValue={c.phone ?? ""} placeholder="03xxxxxxxxx (optional)" className={field} /></label>
          <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm font-semibold">Subah (L)<input name="morning" type="number" min="0" max="5000" step="0.01" defaultValue={c.default_morning || ""} placeholder="Khali = 0" className={field} /></label><label className="text-sm font-semibold">Shaam (L)<input name="evening" type="number" min="0" max="5000" step="0.01" defaultValue={c.default_evening || ""} placeholder="Khali = 0" className={field} /></label></div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input name="active" type="checkbox" defaultChecked={c.active} /> Doodh entry mein active rakhein</label>
          <p className="text-xs text-muted">Qism aur pichla baqaya badalne se purana hisaab badal sakta hai; yahan sirf rozmarra maloomat badlein.</p>
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Maloomat save karein</button>
        </form>}
      </Panel>
      <Panel title="Maheene ka bill" className="lg:col-span-2">
        <label className="mb-3 block text-sm font-semibold">Maheena<input type="month" max={data.today.slice(0, 7)} value={month} onChange={(event) => { setMonth(event.target.value); setPdfStatus(""); }} className={`${field} mt-1 max-w-xs`} /></label>
        {!validMonth && <p role="alert" className="text-udhaar">Aaj tak ka sahi maheena chunein.</p>}
        {validMonth && reportQuery.isPending && <p role="status" className="text-muted">Bill load ho raha hai…</p>}
        {reportQuery.isError && <p role="alert" className="text-udhaar">Bill nahi khula: {friendlyError(reportQuery.error)} <button type="button" onClick={() => void reportQuery.refetch()} className="underline">Dobara koshish</button></p>}
        {reportQuery.isSuccess && !report && <p className="text-muted">Is maheene ka hisaab nahi mila.</p>}
        {report && <dl className="divide-y divide-line">
          {[["Pichla baqaya", report.previous_balance], ["Doodh / parchi ki raqam", report.amount],
            ["Wusooli", report.paid], ["Riayat", report.discount], ["Maheene ke aakhir mein baqi", report.balance]]
            .map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3 py-2"><dt>{label}</dt><dd className="font-bold">{money(amount(value as number))}</dd></div>)}
        </dl>}
        {report && <p className="mt-2 text-sm text-muted">Doodh delivery: {amount(report.litres)} L. Company parchi ki litres neeche register aur PDF mein hain.</p>}
        {report && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pdfBusy} onClick={() => void document("bill", null, false)} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">Tafseeli PDF download</button>
          <button type="button" disabled={pdfBusy} onClick={() => void document("bill", null, true)} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">PDF share karein</button>
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold">WhatsApp matn</a>}
        </div>}
        {!phone && <p className="mt-2 text-sm text-muted">WhatsApp matn ke liye customer ka phone number likhein. PDF phir bhi download/share ho sakta hai.</p>}
        <p className="mt-2 text-xs text-muted">Phone par PDF share sheet khulegi. Desktop par PDF download hoga; WhatsApp mein file khud attach karein.</p>
      </Panel>
      {c.kind !== "cash" && c.kind !== "free" && <Panel title="Wusooli likhein">
        <form onSubmit={onPayment} className="grid gap-2">
          <input name="amount" required type="number" min="0.01" step="0.01" placeholder="Raqam Rs" aria-label="Raqam" className={field} />
          <label className="text-sm text-muted">Wusooli ki tareekh<input name="date" type="date" max={data.today} defaultValue={data.today} required className={field} /></label>
          <select name="method" aria-label="Method" className={field}><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option><option value="cheque">Cheque</option></select>
          <select name="account" required aria-label="Account" defaultValue="" className={field}><option value="" disabled>Raqam kis account mein aayi?</option>{activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <button disabled={busy || !activeAccounts.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Wusooli save karein</button>
        </form>
        {!activeAccounts.length && <p className="mt-2 text-sm text-muted">Pehle Settings mein active account banayein.</p>}
      </Panel>}
      {c.kind !== "company" && c.kind !== "free" && <Panel title="Doodh ka rate">
        <p className="mb-2 text-sm text-muted">Rate ki tareekh chunein. Purani saved deliveries ki raqam nahi badlegi.</p>
        <form onSubmit={onRate} className="grid gap-2">
          <input key={`${c.id}-${rate}`} name="rate" type="number" min="0.01" step="0.01" defaultValue={rate || data.settings.default_milk_rate} required placeholder="Naya rate Rs/L" aria-label="Naya rate Rs/L" className={field} />
          <label className="text-sm text-muted">Rate ki tareekh<input name="date" type="date" min={c.opening_date} max={data.today} defaultValue={data.today} required className={field} /></label>
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-bold text-berseem">Rate save karein</button>
        </form>
        <div className="mt-3 border-t border-line pt-2 text-sm"><strong>Rate ki tareekhwar list</strong><ul>{data.rates.filter((item) => item.customer_id === c.id).sort((a, b) => b.effective_from.localeCompare(a.effective_from)).map((item) => <li key={item.id} className="flex justify-between gap-2 py-1"><span>{shortDate(item.effective_from)}</span><span>{money(item.rate)}/L</span></li>)}</ul></div>
      </Panel>}
      {c.kind === "company" && <Panel title="Company bill">
        <form onSubmit={onCompanyBill} className="grid gap-2">
          <label className="text-sm">Shuru<input name="from" type="date" max={data.today} required defaultValue={`${data.today.slice(0, 7)}-01`} className={field} /></label>
          <label className="text-sm">Khatam<input name="to" type="date" max={data.today} required defaultValue={data.today} className={field} /></label>
          <input name="litres" type="number" min="0" step="0.01" required placeholder="Slip litres" aria-label="Slip litres" className={field} />
          <input name="amount" type="number" min="0" step="0.01" required placeholder="Bill Rs" aria-label="Bill Rs" className={field} />
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white">Bill save karein</button>
        </form>
      </Panel>}
      <Panel title={`${validMonth ? formatMonth(`${month}-01`) : "Maheene"} ka register`} className="lg:col-span-2"><ul className="divide-y divide-line">
        {[...ledger].reverse().map((entry) => {
          const payment = data.payments.find((item) => item.id === entry.id && item.kind === "payment");
          const receiptWa = phone && payment ? `https://wa.me/${phone}?text=${encodeURIComponent(receiptMessage(data.settings, c, payment))}` : null;
          return <li key={entry.id} className="flex flex-wrap items-center gap-2 py-3 text-sm"><span className="text-muted">{shortDate(entry.date)}</span><span className="min-w-32 flex-1">{entry.detail}{entry.litres != null ? ` · ${entry.litres} L` : ""}</span><strong className={entry.credit ? "text-berseem" : ""}>{entry.credit ? `− ${money(entry.credit)}` : money(entry.charge)}</strong>
            {payment && <div className="flex w-full flex-wrap gap-2 sm:justify-end"><button type="button" disabled={pdfBusy} onClick={() => void document("receipt", payment.id, false)} className="min-h-10 rounded-lg border border-line px-3 font-semibold disabled:opacity-50">Receipt PDF</button><button type="button" disabled={pdfBusy} onClick={() => void document("receipt", payment.id, true)} className="min-h-10 rounded-lg border border-berseem px-3 font-semibold text-berseem disabled:opacity-50">PDF share</button>{receiptWa && <a href={receiptWa} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 font-semibold">WhatsApp matn</a>}</div>}
          </li>;
        })}
        {!ledger.length && <li className="py-3 text-muted">Abhi koi entry nahi.</li>}
      </ul></Panel>
      {pdfStatus && <p role="status" className="text-berseem-deep lg:col-span-2">{pdfStatus}</p>}
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error}</p>}
    </Body>
  </>;
}

function CustomerList({ data, save, busy, error, success }: {
  data: FarmData; save: Save; busy: boolean; error: string; success: string;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<CustomerKind>("regular");
  const list = [...data.customers].sort((a, b) =>
    amount(data.balances.find((x) => x.customer_id === b.id)?.balance) -
    amount(data.balances.find((x) => x.customer_id === a.id)?.balance));
  const totalDue = list.reduce((n, c) => n + Math.max(0, amount(data.balances.find((x) => x.customer_id === c.id)?.balance)), 0);
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void save(() => createCustomer(parseNewCustomer(values, kind, data.today)), "Customer save ho gaya.")
      .then((saved) => { if (saved) setAdding(false); });
  };
  return <>
    <PageHeader title="Khata" sub={`${list.length} customers`} action={<button onClick={() => setAdding(!adding)} className="flex min-h-11 items-center gap-1 rounded-xl bg-berseem px-4 font-semibold text-white"><PlusIcon width={18} />Customer</button>} />
    <Body className="grid gap-4">
      {adding && <Panel title="Naya customer"><form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Naam" aria-label="Naam" className={field} />
        <input name="phone" type="tel" placeholder="Phone (misal: 03xxxxxxxxx)" aria-label="Phone" className={field} />
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as CustomerKind)} aria-label="Qism" className={field}><option value="regular">Regular</option><option value="contractor">Contractor</option><option value="company">Company</option><option value="cash">Cash</option><option value="free">Muft</option></select>
        <label className="text-sm text-muted">Doodh ka rate (Rs/L) · Settings se<input name="rate" type="number" min="0.01" step="0.01" defaultValue={data.settings.default_milk_rate} placeholder="Rate Rs/L" disabled={kind === "company" || kind === "free"} className={field} /></label>
        <input name="morning" type="number" min="0" max="5000" step="0.01" placeholder="Subah L (khali = 0)" aria-label="Subah litres" className={field} />
        <input name="evening" type="number" min="0" max="5000" step="0.01" placeholder="Shaam L (khali = 0)" aria-label="Shaam litres" className={field} />
        <label className="text-sm text-muted">Pichla baqaya (Rs)<input name="openingBalance" type="number" step="0.01" placeholder="Khali = 0; advance ke liye - raqam" aria-label="Pichla baqaya" disabled={kind === "cash" || kind === "free"} className={field} /><span className="text-xs">Positive = lena hai; negative = customer ka advance.</span></label>
        <label className="text-sm text-muted">Pichla hisaab kis tareekh se?<input name="openingDate" type="date" max={data.today} defaultValue={data.today} required className={field} /></label>
        <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Customer save karein</button>
      </form></Panel>}
      <section className="rounded-2xl bg-udhaar p-5 text-white"><p className="text-white/80">Kul udhaar jo lena hai</p><p className="font-display text-[40px] font-extrabold">{money(totalDue)}</p></section>
      <ul className="overflow-hidden rounded-2xl border border-line bg-paper">{list.map((c) => {
        const balance = amount(data.balances.find((x) => x.customer_id === c.id)?.balance);
        const report = data.reports.find((x) => x.customer_id === c.id);
        return <li key={c.id} className="border-b border-line last:border-0"><Link href={`/khata/?id=${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ground"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ground font-display font-bold">{c.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate">{c.name}</strong><span className="text-sm text-muted">Is maah {amount(report?.litres)} L</span></span><strong className={balance > 0 ? "text-udhaar" : "text-berseem"}>{balance > 0 ? money(balance) : balance < 0 ? `Advance ${money(-balance)}` : "Saaf"}</strong></Link></li>;
      })}{!list.length && <li className="p-5 text-muted">Abhi koi customer nahi.</li>}</ul>
      {success && <p role="status" className="text-berseem-deep">{success}</p>}
      {error && <p role="alert" className="text-udhaar">Save nahi hua: {error}</p>}
    </Body>
  </>;
}

export default function FarmCustomers() {
  const query = useFarmData();
  const queryClient = useQueryClient();
  const id = useSearchParams().get("id") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const save: Save = async (action, message) => {
    setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["farm-data"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-report"] });
      setSuccess(message);
      return true;
    } catch (saveError) {
      setError(friendlyError(saveError));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const customer = data.customers.find((c) => c.id === id);
  return customer
    ? <CustomerDetail data={data} customer={customer} save={save} busy={busy} error={error} success={success} />
    : <CustomerList data={data} save={save} busy={busy} error={error} success={success} />;
}
