"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { longDate, money } from "@/lib/farm-data";
import { todayPK, formatMonth } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { parseAgreedAmount, parsePayment, parsePeriod, parseStaff, paidCents, remainingCents } from "@/lib/salary-forms";
import { createStaff, loadSalaryData, openSalaryPeriod, recordSalaryPayment, updateSalaryPeriod, updateStaff } from "@/lib/salary";
import { Body, PageHeader, Panel } from "./ui";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3";
type Pending = { id: string; signature: string };

export default function StaffSalary() {
  const query = useQuery({ queryKey: ["salary"], queryFn: loadSalaryData, staleTime: 15_000 });
  const qc = useQueryClient();
  const today = todayPK();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const staffPending = useRef<Pending | null>(null);
  const periodPending = useRef<Pending | null>(null);
  const paymentPending = useRef<Pending | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const run = async (action: () => Promise<void>, message: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["salary"] }, { throwOnError: true }),
          qc.invalidateQueries({ queryKey: ["farm-data"] }, { throwOnError: true }),
          qc.invalidateQueries({ queryKey: ["galla"] }, { throwOnError: true }),
        ]);
        setSuccess(message);
      } catch { setSuccess("Supabase mein save ho gaya. Naye totals load nahi hue; page reload karein."); }
    } catch (issue) {
      setError(friendlyError(issue));
      void qc.invalidateQueries({ queryKey: ["salary"] });
    } finally { busyRef.current = false; setBusy(false); }
  };

  if (!query.data) return <>
    <PageHeader title="Mulazim aur tankhwah" sub="Mahwari tankhwah ka hisaab" />
    <Body><p role={query.error ? "alert" : "status"}>{query.error ? friendlyError(query.error) : "Tankhwah load ho rahi hai…"}</p>
      {query.error && <button type="button" onClick={() => void query.refetch()} className="mt-2 underline">Dobara koshish</button>}
    </Body>
  </>;

  const data = query.data;
  const staff = [...data.staff].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const selected = staff.find((item) => item.id === staffId) ?? staff[0];
  const selectedMonth = `${month}-01`;
  const period = data.periods.find((item) => item.staff_id === selected?.id && item.salary_month === selectedMonth);
  const salaryCategory = data.categories.find((item) => item.active && item.is_salary && item.is_farm_cost && item.name === "Tankhwah")
    ?? data.categories.find((item) => item.active && item.is_salary && item.is_farm_cost);
  const accounts = data.accounts.filter((item) => item.active);
  const payments = period ? data.payments.filter((item) => item.salary_period_id === period.id)
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.id.localeCompare(a.id)) : [];
  const paid = period ? paidCents(period.id, data.payments) : 0;
  const remaining = period ? remainingCents(period, data.payments) : 0;

  const onCreateStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const fields = parseStaff(new FormData(form));
      const signature = JSON.stringify(fields);
      if (staffPending.current?.signature !== signature) staffPending.current = { id: crypto.randomUUID(), signature };
      await createStaff(staffPending.current.id, fields);
      setStaffId(staffPending.current.id);
      staffPending.current = null;
      form.reset();
    }, "Mulazim Supabase mein save ho gaya.");
  };

  const onOpenPeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const fields = parsePeriod(new FormData(form), today, staff);
      const signature = JSON.stringify(fields);
      if (periodPending.current?.signature !== signature) periodPending.current = { id: crypto.randomUUID(), signature };
      await openSalaryPeriod(periodPending.current.id, fields);
      periodPending.current = null;
    }, "Is maheene ki tankhwah tay ho gayi.");
  };

  const onPay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!period || !salaryCategory) return;
    const form = event.currentTarget;
    void run(async () => {
      const fields = parsePayment(new FormData(form), today, period, accounts, data.payments);
      const signature = JSON.stringify({ categoryId: salaryCategory.id, ...fields });
      if (paymentPending.current?.signature !== signature) paymentPending.current = { id: crypto.randomUUID(), signature };
      await recordSalaryPayment(paymentPending.current.id, salaryCategory.id, fields);
      paymentPending.current = null;
      form.reset();
    }, "Tankhwah ada ho gayi. Galla aur farm kharcha update ho gaye.");
  };

  return <>
    <PageHeader title="Mulazim aur tankhwah" sub="Mahwari tankhwah ka hisaab" />
    <Body className="grid gap-4 lg:grid-cols-2">
      <Link href="/kharcha/" className="font-semibold text-berseem-deep underline lg:col-span-2">← Kharcha aur munafa</Link>
      <Panel title="Naya mulazim"><form onSubmit={onCreateStaff} className="grid gap-3">
        <label className="text-sm">Naam<input name="name" required maxLength={100} placeholder="Mulazim ka naam" className={field} /></label>
        <label className="text-sm">Kaam (optional)<input name="role" maxLength={100} placeholder="Misal: farm worker" className={field} /></label>
        <label className="text-sm">Mahwari default tankhwah (Rs, optional)<input name="monthly_salary" type="number" min="0" step="0.01" placeholder="Misal: 25000" className={field} /></label>
        <input type="hidden" name="active" value="on" />
        <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Mulazim shamil karein</button>
      </form><p className="mt-2 text-xs text-muted">Khali chhorne par har mahine ki raqam alag tay karein. Purane mahino ka hisaab nahi badlega.</p></Panel>

      <Panel title="Mulazim ki maloomat">{selected ? <form key={`${selected.id}-${selected.updated_at}`} onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget;
        void run(async () => { await updateStaff(selected.id, selected.updated_at, parseStaff(new FormData(form))); }, "Mulazim ki maloomat save ho gayi.");
      }} className="grid gap-3">
        <label className="text-sm">Mulazim<select value={selected.id} disabled={busy} onChange={(event) => setStaffId(event.target.value)} className={field}>
          {staff.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (band)"}</option>)}
        </select></label>
        <label className="text-sm">Naam<input name="name" required maxLength={100} defaultValue={selected.name} className={field} /></label>
        <label className="text-sm">Kaam<input name="role" maxLength={100} defaultValue={selected.role ?? ""} placeholder="Kaam (optional)" className={field} /></label>
        <label className="text-sm">Naye mahine ki default tankhwah (Rs, optional)<input name="monthly_salary" type="number" min="0" step="0.01" defaultValue={selected.monthly_salary > 0 ? selected.monthly_salary : ""} placeholder="Raqam likhein ya khali chhorein" className={field} /></label>
        <label className="text-sm"><input name="active" type="checkbox" defaultChecked={selected.active} /> Active mulazim</label>
        <button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-semibold text-berseem-deep disabled:opacity-50">Maloomat save karein</button>
      </form> : <p className="text-sm text-muted">Pehle mulazim shamil karein.</p>}</Panel>

      <Panel title="Mahine ki tankhwah" className="lg:col-span-2">
        <label className="block max-w-xs text-sm">Tankhwah ka maheena<input type="month" max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} className={field} /></label>
        {staff.length > 0 && <ul className="mt-4 grid gap-2 sm:grid-cols-2">{staff.map((item) => {
          const row = data.periods.find((entry) => entry.staff_id === item.id && entry.salary_month === selectedMonth);
          const due = row ? remainingCents(row, data.payments) / 100 : null;
          return <li key={item.id}><button type="button" disabled={busy} onClick={() => setStaffId(item.id)}
            className={`w-full rounded-xl border p-3 text-left ${selected?.id === item.id ? "border-berseem bg-berseem-soft" : "border-line"}`}>
            <span className="font-semibold">{item.name}{item.active ? "" : " (band)"}</span>
            <span className="mt-1 block text-sm text-muted">{row ? `Tay ${money(row.agreed_amount)} · Ada ${money(paidCents(row.id, data.payments) / 100)} · Baqi ${money(due)}` : "Is mahine ki raqam abhi tay nahi hui."}</span>
          </button></li>;
        })}</ul>}
        {selected && !period && <form key={`${selected.id}-${month}-${selected.monthly_salary}`} onSubmit={onOpenPeriod} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <input type="hidden" name="staff" value={selected.id} /><input type="hidden" name="month" value={month} />
          <label className="text-sm">{selected.name} ki tay shuda tankhwah (Rs)<input name="agreed_amount" type="number" min="0.01" step="0.01" required defaultValue={selected.monthly_salary > 0 ? selected.monthly_salary : ""} placeholder="Raqam likhein" className={field} /></label>
          <button disabled={busy || !month || month > today.slice(0, 7)} className="min-h-11 self-end rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Mahina kholein</button>
        </form>}
        {selected && period && <div className="mt-4 border-t border-line pt-4">
          <h3 className="font-semibold">{selected.name} · {formatMonth(period.salary_month)}</h3>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm"><div><dt>Tay shuda</dt><dd className="font-bold">{money(period.agreed_amount)}</dd></div><div><dt>Ada hui</dt><dd className="font-bold">{money(paid / 100)}</dd></div><div><dt>Baqi</dt><dd className="font-bold">{money(remaining / 100)}</dd></div></dl>
          {paid === 0 && <form key={`${period.id}-${period.agreed_amount}`} onSubmit={(event) => {
            event.preventDefault(); const form = event.currentTarget;
            void run(async () => {
              const next = parseAgreedAmount(String(new FormData(form).get("agreed_amount") ?? ""), period, data.payments);
              await updateSalaryPeriod(period.id, Number(period.agreed_amount), next);
            }, "Tay shuda tankhwah update ho gayi.");
          }} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">Adaigi se pehle raqam badlein<input name="agreed_amount" type="number" min="0.01" step="0.01" required defaultValue={period.agreed_amount} className={field} /></label>
            <button disabled={busy} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem-deep disabled:opacity-50">Raqam save</button>
          </form>}
        </div>}
      </Panel>

      {selected && period && <Panel title="Tankhwah ada karein" className="lg:col-span-2">
        <p className="mb-3 text-sm text-muted">{formatMonth(period.salary_month)} ki baqi raqam {money(remaining / 100)}. Har payment Galla aur farm kharchay mein ek dafa aayegi.</p>
        {remaining > 0 && salaryCategory && <form key={period.id} onSubmit={onPay} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Adaigi ki tareekh<input name="date" type="date" min={period.salary_month} max={today} required defaultValue={today} className={field} /></label>
          <label className="text-sm">Paisa kis account se nikla?<select name="account" required defaultValue="" className={field}>
            <option value="" disabled>Account chunein</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="text-sm">Adaigi ki raqam (Rs)<input name="amount" type="number" min="0.01" max={(remaining / 100).toFixed(2)} step="0.01" required placeholder="Misal: 5000" className={field} /></label>
          <label className="text-sm">Note (optional)<input name="note" maxLength={500} placeholder="Misal: pehli qist" className={field} /></label>
          <button disabled={busy || !accounts.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Tankhwah save karein</button>
        </form>}
        {!salaryCategory && <p role="alert" className="text-sm text-udhaar">Active Tankhwah category nahi mili. Category setup check karein.</p>}
        {!accounts.length && remaining > 0 && <p role="alert" className="text-sm text-udhaar">Pehle active account shamil karein.</p>}
        {remaining <= 0 && <p className="text-sm text-berseem-deep">Is mahine ki tankhwah poori ada ho gayi.</p>}
      </Panel>}

      {selected && period && <Panel title="Adaigi ka record" className="lg:col-span-2">
        <ul className="divide-y divide-line text-sm">{payments.map((item) => <li key={item.id} className="grid gap-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_9rem]">
          <span>{longDate(item.expense_date)}</span>
          <span className="min-w-0 break-words text-muted">{data.accounts.find((account) => account.id === item.account_id)?.name ?? "Account"}{item.note ? ` · ${item.note}` : ""}</span>
          <strong className="sm:text-right">{money(item.amount)}</strong>
        </li>)}{!payments.length && <li className="py-3 text-muted">Abhi koi adaigi nahi.</li>}</ul>
      </Panel>}

      <p className="text-xs text-muted lg:col-span-2">Farm munafa adaigi ki tareekh par cash basis se badalta hai. Tankhwah ka maheena baqi hisaab ke liye hai. Advance aur paid entry ki correction baad ke kaam mein hain.</p>
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error} Connection tootne par dobara save se pehle record check karein.</p>}
    </Body>
  </>;
}
