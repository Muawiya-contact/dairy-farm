"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  amount, createCustomer, customerRate, insertRow, money, saveCustomerRate,
  shortDate, useFarmData, type Customer, type FarmData,
} from "@/lib/farm-data";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { PlusIcon } from "./icons";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
type Save = (action: () => Promise<void>, message: string) => Promise<boolean>;

function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^92\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `92${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) return `92${digits}`;
  return null;
}

function CustomerDetail({ data, customer, save, busy, error, success }: {
  data: FarmData; customer: Customer; save: Save; busy: boolean; error: string; success: string;
}) {
  const c = customer;
  const balance = amount(data.balances.find((x) => x.customer_id === c.id)?.balance);
  const report = data.reports.find((x) => x.customer_id === c.id);
  const rate = customerRate(data, c.id);
  const month = new Date(`${data.today.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const ledger = [
    ...data.deliveries.filter((x) => x.customer_id === c.id).map((x) => ({
      id: x.id, date: x.delivery_date,
      text: `${x.shift === "morning" ? "Subah" : "Shaam"} · ${amount(x.litres)} L`, value: amount(x.amount),
    })),
    ...data.companyBills.filter((x) => x.customer_id === c.id).map((x) => ({
      id: x.id, date: x.to_date, text: "Company bill", value: amount(x.amount),
    })),
    ...data.payments.filter((x) => x.customer_id === c.id).map((x) => ({
      id: x.id, date: x.payment_date,
      text: x.kind === "discount" ? "Discount" : "Wusooli", value: -amount(x.amount),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const bill = `${data.settings.farm_name}\nAssalam o Alaikum ${c.name},\n${month} ka hisaab:\n` +
    `Pichla baqaya: ${money(report?.previous_balance)}\nDoodh: ${amount(report?.litres)} L = ${money(report?.amount)}\n` +
    `Wusooli: ${money(report?.paid)}\nDiscount: ${money(report?.discount)}\n` +
    `Kul baqi: ${money(report?.balance)}\n${data.settings.whatsapp_footer}`;
  const phone = whatsappNumber(c.phone);
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(bill)}` : null;
  const onPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void save(async () => {
      await insertRow("payments", {
        customer_id: c.id, payment_date: String(values.get("date")), amount: Number(values.get("amount")),
        kind: "payment", method: String(values.get("method")), account_id: String(values.get("account")),
      });
      form.reset();
    }, "Wusooli Supabase mein save ho gayi.");
  };
  const onRate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void save(() => saveCustomerRate(c.id, Number(values.get("rate")), String(values.get("date"))), "Naya rate save ho gaya.");
  };
  const onCompanyBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void save(async () => {
      await insertRow("company_bills", {
        customer_id: c.id, from_date: String(values.get("from")), to_date: String(values.get("to")),
        litres: Number(values.get("litres")), amount: Number(values.get("amount")),
      });
      form.reset();
    }, "Company bill save ho gaya.");
  };

  return <>
    <PageHeader title={c.name} sub={`${c.phone ?? "Phone darj nahi"} · Subah ${amount(c.default_morning)} L · Shaam ${amount(c.default_evening)} L${rate ? ` · ${money(rate)}/L` : ""}`} back="/khata/" />
    <Body className="grid gap-4 lg:grid-cols-2">
      <section className={`rounded-2xl p-5 text-white ${balance > 0 ? "bg-udhaar" : "bg-berseem"}`}>
        <p className="text-white/80">{balance > 0 ? "Baqi raqam" : balance < 0 ? "Customer ka advance" : "Hisaab saaf"}</p>
        <p className="font-display text-[44px] font-extrabold">{money(Math.abs(balance))}</p>
      </section>
      <Panel title={`${month} ka bill`}>
        <dl className="divide-y divide-line">
          {[["Pichla baqaya", report?.previous_balance], [`Doodh · ${amount(report?.litres)} L`, report?.amount],
            ["Wusooli", report?.paid], ["Discount", report?.discount], ["Kul baqi", report?.balance]]
            .map(([label, value]) => <div key={String(label)} className="flex justify-between py-2"><dt>{label}</dt><dd className="font-bold">{money(amount(value as number))}</dd></div>)}
        </dl>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-berseem px-4 font-semibold text-berseem">WhatsApp bill</a>}
      </Panel>
      {c.kind !== "cash" && c.kind !== "free" && <Panel title="Wusooli likhein">
        <form onSubmit={onPayment} className="grid gap-2">
          <input name="amount" required type="number" min="0.01" step="0.01" placeholder="Raqam Rs" aria-label="Raqam" className={field} />
          <input name="date" type="date" defaultValue={data.today} required aria-label="Tareekh" className={field} />
          <select name="method" aria-label="Method" className={field}><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option><option value="cheque">Cheque</option></select>
          <select name="account" required aria-label="Account" className={field}>{data.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <button disabled={busy || !data.accounts.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Wusooli save karein</button>
        </form>
      </Panel>}
      {c.kind !== "company" && c.kind !== "free" && <Panel title="Doodh ka rate">
        <p className="mb-2 text-sm text-muted">Nayi tareekh se rate badlein. Purani entries ka rate wahi rahega.</p>
        <form onSubmit={onRate} className="grid gap-2">
          <input key={`${c.id}-${rate}`} name="rate" type="number" min="0.01" step="0.01" defaultValue={rate || data.settings.default_milk_rate} required aria-label="Naya rate Rs/L" className={field} />
          <input name="date" type="date" max={data.today} defaultValue={data.today} required aria-label="Rate ki tareekh" className={field} />
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-bold text-berseem">Rate save karein</button>
        </form>
      </Panel>}
      {c.kind === "company" && <Panel title="Company bill">
        <form onSubmit={onCompanyBill} className="grid gap-2">
          <label className="text-sm">Shuru<input name="from" type="date" required defaultValue={`${data.today.slice(0, 7)}-01`} className={field} /></label>
          <label className="text-sm">Khatam<input name="to" type="date" required defaultValue={data.today} className={field} /></label>
          <input name="litres" type="number" min="0" step="0.01" required placeholder="Slip litres" aria-label="Slip litres" className={field} />
          <input name="amount" type="number" min="0" step="0.01" required placeholder="Bill Rs" aria-label="Bill Rs" className={field} />
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white">Bill save karein</button>
        </form>
      </Panel>}
      <Panel title="Register" className="lg:col-span-2"><ul className="divide-y divide-line">
        {ledger.map((x) => <li key={x.id} className="flex justify-between gap-3 py-2 text-sm"><span className="text-muted">{shortDate(x.date)}</span><span className="min-w-0 flex-1 truncate">{x.text}</span><strong className={x.value < 0 ? "text-berseem" : ""}>{x.value < 0 ? "− " : ""}{money(Math.abs(x.value))}</strong></li>)}
        {!ledger.length && <li className="py-3 text-muted">Abhi koi entry nahi.</li>}
      </ul></Panel>
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error}</p>}
    </Body>
  </>;
}

function CustomerList({ data, save, busy, error, success }: {
  data: FarmData; save: Save; busy: boolean; error: string; success: string;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("regular");
  const list = [...data.customers].sort((a, b) =>
    amount(data.balances.find((x) => x.customer_id === b.id)?.balance) -
    amount(data.balances.find((x) => x.customer_id === a.id)?.balance));
  const totalDue = list.reduce((n, c) => n + Math.max(0, amount(data.balances.find((x) => x.customer_id === c.id)?.balance)), 0);
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void save(() => createCustomer({
      name: String(values.get("name")), phone: String(values.get("phone")), kind,
      morning: Number(values.get("morning")) || 0, evening: Number(values.get("evening")) || 0,
      rate: Number(values.get("rate")) || 0,
      openingBalance: kind === "cash" || kind === "free" ? 0 : Number(values.get("openingBalance")) || 0,
      openingDate: String(values.get("openingDate")),
    }), "Customer save ho gaya.").then((saved) => { if (saved) setAdding(false); });
  };
  return <>
    <PageHeader title="Khata" sub={`${list.length} customers`} action={<button onClick={() => setAdding(!adding)} className="flex min-h-11 items-center gap-1 rounded-xl bg-berseem px-4 font-semibold text-white"><PlusIcon width={18} />Customer</button>} />
    <Body className="grid gap-4">
      {adding && <Panel title="Naya customer"><form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Naam" aria-label="Naam" className={field} />
        <input name="phone" placeholder="Phone" aria-label="Phone" className={field} />
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Qism" className={field}><option value="regular">Regular</option><option value="contractor">Contractor</option><option value="company">Company</option><option value="cash">Cash</option><option value="free">Muft</option></select>
        <input name="rate" type="number" min="0" step="0.01" defaultValue={data.settings.default_milk_rate} placeholder="Rate Rs/L" aria-label="Rate" disabled={kind === "company" || kind === "free"} className={field} />
        <input name="morning" type="number" min="0" step="0.01" defaultValue="0" placeholder="Subah L" aria-label="Subah litres" className={field} />
        <input name="evening" type="number" min="0" step="0.01" defaultValue="0" placeholder="Shaam L" aria-label="Shaam litres" className={field} />
        <input name="openingBalance" type="number" step="0.01" defaultValue="0" placeholder="Pichla baqaya Rs" aria-label="Pichla baqaya" disabled={kind === "cash" || kind === "free"} className={field} />
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
      setSuccess(message);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
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
