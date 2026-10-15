"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { closeFarmMonth, getMonthLockEvents, getMonthLocks, previousMonth, reopenFarmMonth, validateMonthClose } from "@/lib/month-close";
import { friendlyError } from "@/lib/errors";
import { formatMonth, todayPK } from "@/lib/dates";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3";

export function MonthCloseSection() {
  const client = useQueryClient();
  const [month, setMonth] = useState(() => previousMonth());
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirmMonth, setConfirmMonth] = useState("");
  const [message, setMessage] = useState("");
  const locks = useQuery({ queryKey: ["month-locks"], queryFn: getMonthLocks });
  const events = useQuery({ queryKey: ["month-lock-events"], queryFn: getMonthLockEvents });
  const selected = locks.data?.find((item) => item.month === `${month}-01`);
  const mutation = useMutation({
    mutationFn: async () => selected ? reopenFarmMonth(month, reason) : closeFarmMonth(month, note),
    onSuccess: (changed) => {
      setMessage(changed ? selected ? "Maheena dobara khul gaya." : "Maheena band ho gaya." : "Maheene ki haalat pehle hi badal chuki thi; list refresh ho gayi.");
      setConfirmMonth(""); setReason(""); setNote("");
      void client.invalidateQueries({ queryKey: ["month-locks"] });
      void client.invalidateQueries({ queryKey: ["month-lock-events"] });
      void client.invalidateQueries({ queryKey: ["farm-data"] });
    },
    onError: () => {
      // The server may have committed before a connection dropped. Read it back.
      void client.invalidateQueries({ queryKey: ["month-locks"] });
      void client.invalidateQueries({ queryKey: ["month-lock-events"] });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    if (selected && confirmMonth !== month) { setMessage("Dobara kholne se pehle wohi maheena likhein."); return; }
    mutation.mutate();
  };
  const closeIssue = validateMonthClose(month, todayPK());
  return <section className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-display text-xl font-bold">Maheena band karein</h2>
    <p className="mt-1 text-sm text-muted">Guzra hua maheena band karne se us ki doodh, payment, kharcha aur galla entries badal nahi sakti. Zaroorat par wajah likh kar dobara kholein. Har faisla record hota hai.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3">
      <label className="font-semibold">Maheena<input type="month" required max={previousMonth()} value={month} onChange={(event) => { setMonth(event.target.value); setMessage(""); mutation.reset(); }} className={field} /></label>
      {locks.isPending && <p role="status" className="text-muted">Band maheenay load ho rahe hain…</p>}
      {locks.isError && <p role="alert" className="text-udhaar">Haalat nahi mili: {friendlyError(locks.error)} <button type="button" onClick={() => void locks.refetch()} className="underline">Dobara koshish</button></p>}
      {locks.data && <p className="text-sm font-semibold">{month ? formatMonth(`${month}-01`) : "Maheena"}: {selected ? "Band" : "Khula"}{selected?.locked_at ? ` · ${new Date(selected.locked_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}` : ""}</p>}
      {locks.data && selected ? <>
        <label className="font-semibold">Dobara kholne ki wajah<input required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Misal: galat entry ki correction" className={field} /></label>
        <label className="font-semibold">Tasdeeq ke liye {month} likhein<input required value={confirmMonth} onChange={(event) => setConfirmMonth(event.target.value)} placeholder={month} className={field} /></label>
        <button disabled={mutation.isPending || confirmMonth !== month || reason.trim().length < 5} className="min-h-11 rounded-xl border border-udhaar px-4 font-bold text-udhaar disabled:opacity-50">{mutation.isPending ? "Khol rahe hain…" : "Maheena dobara kholein"}</button>
      </> : locks.data && <>
        <label className="font-semibold">Band karne ka note (optional)<input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Misal: hisaab mil gaya" className={field} /></label>
        <button disabled={mutation.isPending || !!closeIssue} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50">{mutation.isPending ? "Band ho raha hai…" : "Maheena band karein"}</button>
      </>}
      {closeIssue && !selected && <p role="alert" className="text-udhaar">{closeIssue}</p>}
      {message && <p role="status" className="text-berseem-deep">{message}</p>}
      {mutation.isError && <p role="alert" className="text-udhaar">Save ki tasdeeq nahi hui: {friendlyError(mutation.error)} List refresh hui hai; dobara karne se pehle haalat dekhein.</p>}
    </form>
    <h3 className="mt-5 border-t border-line pt-4 font-semibold">Aakhri faislay</h3>
    {events.isError && <p role="alert" className="text-udhaar">History nahi mili: {friendlyError(events.error)} <button type="button" onClick={() => void events.refetch()} className="underline">Dobara koshish</button></p>}
    {events.isPending && <p role="status" className="text-muted">History load ho rahi hai…</p>}
    {events.data && <ul className="mt-2 divide-y divide-line text-sm">{events.data.map((item) => <li key={item.id} className="py-2">{formatMonth(item.month)} · {item.action === "close" ? "Band" : "Dobara khula"} · {new Date(item.created_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}{item.reason && <span className="block text-muted">{item.reason}</span>}</li>)}{!events.data.length && <li className="py-2 text-muted">Abhi koi faisla nahi.</li>}</ul>}
  </section>;
}
