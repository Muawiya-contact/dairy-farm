"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccounts } from "@/lib/accounts";
import { todayPK } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { money, shortDate } from "@/lib/farm-data";
import { listOtherIncome, parseOtherIncome, recordOtherIncome } from "@/lib/other-income";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";

export default function FarmIncome() {
  const today = todayPK();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef<{ id: string; signature: string } | null>(null);
  const busyRef = useRef(false);
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["income-accounts"], queryFn: getAccounts });
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7);
  const entries = useQuery({ queryKey: ["other-income", month], queryFn: () => listOtherIncome(month), enabled: validMonth });
  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current || !accounts.data) return;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    const form = event.currentTarget;
    try {
      const input = parseOtherIncome(new FormData(form), today, accounts.data);
      const signature = JSON.stringify(input);
      if (pending.current?.signature !== signature) pending.current = { id: crypto.randomUUID(), signature };
      await recordOtherIncome(pending.current.id, input);
      pending.current = null;
      form.reset();
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["other-income"] }, { throwOnError: true }),
          qc.invalidateQueries({ queryKey: ["galla"] }, { throwOnError: true }),
          qc.invalidateQueries({ queryKey: ["farm-data"] }, { throwOnError: true }),
        ]);
        setSuccess("Aamdani save ho gayi. Account ka hisaab bhi update ho gaya.");
      } catch { setSuccess("Aamdani save ho gayi. Naya hisaab dekhne ke liye page dobara kholein."); }
    } catch (issue) { setError(friendlyError(issue)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  if (!accounts.data) return <FarmLoading error={accounts.error} retry={() => void accounts.refetch()} />;
  const activeAccounts = accounts.data.filter((account) => account.active);
  return <><PageHeader title="Doosri aamdani" sub="Gobar aur doosri farm kamai" back="/kharcha/" />
    <Body className="grid gap-4 lg:grid-cols-2">
      <Panel title="Nayi aamdani"><form onSubmit={(event) => void onSave(event)} className="grid gap-3">
        <label className="text-sm">Tareekh<input name="date" type="date" max={today} defaultValue={today} required className={field} /></label>
        <label className="text-sm">Qism<select name="kind" className={field}><option value="manure">Gobar</option><option value="other">Doosri aamdani</option></select></label>
        <label className="text-sm">Raqam (Rs)<input name="amount" type="number" min="0.01" step="0.01" required placeholder="Misal: 2500" className={field} /></label>
        <label className="text-sm">Kis account mein aayi?<select name="account" defaultValue="" required className={field}><option value="" disabled>Account chunein</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="text-sm">Tafseel (optional)<input name="note" placeholder="Misal: gobar farokht" className={field} /></label>
        <button disabled={busy || !activeAccounts.length} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50">Aamdani save karein</button>
      </form>{!activeAccounts.length && <p role="alert" className="mt-2 text-sm text-udhaar">Pehle Kharcha mein account banayein.</p>}
        {success && <p role="status" className="mt-3 text-sm text-berseem">{success}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-udhaar">Save nahi hua: {error} Agar connection toot gaya ho to dobara save se pehle list dekhein.</p>}
      </Panel>
      <Panel title="Aamdani ka register"><label className="text-sm">Maheena<input type="month" max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} className={field} /></label>
        {entries.isLoading && <p className="mt-3 text-sm text-muted">Record khul raha hai…</p>}
        {entries.error && <p role="alert" className="mt-3 text-sm text-udhaar">Record nahi khula: {friendlyError(entries.error)} <button onClick={() => void entries.refetch()} className="underline">Dobara koshish</button></p>}
        <ul className="mt-3 divide-y divide-line">{entries.data && [...entries.data].sort((a, b) => b.income_date.localeCompare(a.income_date)).map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><strong>{entry.kind === "animal_sale" ? "Janwar farokht" : entry.kind === "manure" ? "Gobar" : "Doosri aamdani"}</strong><span className="block text-muted">{shortDate(entry.income_date)} · {accounts.data.find((account) => account.id === entry.account_id)?.name ?? "Account"}{entry.note ? ` · ${entry.note}` : ""}</span></span><strong>{money(entry.amount)}</strong></li>)}{entries.data?.length === 0 && <li className="py-3 text-sm text-muted">Is maheene koi doosri aamdani nahi.</li>}</ul>
        <Link href="/galla/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-berseem underline">Galla ka hisaab dekhein →</Link>
      </Panel>
    </Body></>;
}
