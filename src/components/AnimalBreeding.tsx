"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { insertRow, shortDate, type Animal, type Calving, type Insemination } from "@/lib/farm-data";
import { Panel } from "./ui";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const statusNames: Record<string, string> = { pending: "Nateeja baqi", pregnant: "Gaabhan", empty: "Khali", aborted: "Hamla zaya", calved: "Bacha paida" };
const semenNames: Record<string, string> = { normal: "Normal", sexed: "Sexed", bull: "Bull" };
const optional = (form: FormData, key: string) => String(form.get(key) ?? "").trim() || null;

export function AnimalBreeding({ animal, records, calvings, today, busy, run }: {
  animal: Animal; records: Insemination[]; calvings: Calving[]; today: string; busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("pending");
  const [validation, setValidation] = useState("");
  const editing = records.find((record) => record.id === editId);
  const active = animal.life_status === "active" && animal.sex === "female";

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void run(async () => {
      await insertRow("inseminations", {
        animal_id: animal.id, service_date: String(values.get("service_date")),
        semen_type: String(values.get("semen_type")), semen_name: optional(values, "semen_name"),
        technician: optional(values, "technician"), notes: optional(values, "notes"),
      });
      form.reset();
    });
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const values = new FormData(event.currentTarget);
    const status = String(values.get("status"));
    const ultrasoundDate = optional(values, "ultrasound_date");
    const ultrasoundResult = optional(values, "ultrasound_result");
    const checkupDate = optional(values, "checkup_date");
    const checkupResult = optional(values, "checkup_result");
    const abortionDate = status === "aborted" ? optional(values, "abortion_date") : null;
    if ((ultrasoundResult && !ultrasoundDate) || (checkupResult && !checkupDate) || (status === "aborted" && !abortionDate)) {
      setValidation("Nateeja ke saath tareekh bhi likhein; hamla zaya ho to uski tareekh bhi likhein.");
      return;
    }
    setValidation("");
    const record = editing;
    void run(async () => {
      const { data, error } = await getSupabase().from("inseminations").update({
        service_date: String(values.get("service_date")), semen_type: String(values.get("semen_type")),
        semen_name: optional(values, "semen_name"), technician: optional(values, "technician"),
        ultrasound_date: ultrasoundDate, ultrasound_result: ultrasoundResult,
        checkup_date: checkupDate, checkup_result: checkupResult,
        dry_off_date: optional(values, "dry_off_date"),
        status, abortion_date: abortionDate, notes: optional(values, "notes"),
      }).eq("id", record.id).eq("updated_at", record.updated_at).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("BREEDING_STALE");
      setEditId(null);
    });
  };

  const calve = (event: FormEvent<HTMLFormElement>, record: Insemination) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void run(async () => {
      const { error } = await getSupabase().rpc("record_calving", {
        p_insemination_id: record.id, p_calving_date: String(values.get("calving_date")),
        p_outcome: String(values.get("outcome")), p_notes: optional(values, "notes") ?? undefined,
      });
      if (error) throw error;
      form.reset();
    });
  };

  return <Panel title="Nasl kashi aur bachay ki paidaish" className="lg:col-span-2">
    {animal.sex === "male" && <p className="text-sm text-muted">Nasl kashi aur paidaish ki entries sirf mada janwar ke liye hain.</p>}
    {active && <form onSubmit={add} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">Nayi tukhm rezi</h3>
      <label className="text-sm font-semibold">Tukhm rezi ki tareekh<input name="service_date" type="date" required max={today} defaultValue={today} disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Semen ki qism<select name="semen_type" disabled={busy} className={field}><option value="normal">Normal</option><option value="sexed">Sexed</option><option value="bull">Bull</option></select></label>
      <label className="text-sm font-semibold">Semen ka naam<input name="semen_name" placeholder="Misal: Irishman" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Technician<input name="technician" placeholder="Technician ka naam" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Notes<input name="notes" placeholder="Zaroori tafseel" disabled={busy} className={field} /></label>
      <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">Tukhm rezi save karein</button>
    </form>}
    {records.length === 0 && <p className="mt-4 text-sm text-muted">Abhi koi nasl kashi record nahi.</p>}
    <div className="mt-4 grid gap-3">{records.map((record) => {
      const calving = calvings.find((item) => item.insemination_id === record.id);
      const open = record.status === "pending" || record.status === "pregnant";
      return <article key={record.id} className="rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{shortDate(record.service_date)} · {semenNames[record.semen_type] ?? record.semen_type} · {record.semen_name || "Naam darj nahi"}</h3><span className="text-sm font-semibold text-berseem-deep">{statusNames[record.status] ?? record.status}</span></div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted">Ultrasound</dt><dd>{record.ultrasound_date ? shortDate(record.ultrasound_date) : `Mutawaqqa ${shortDate(record.ultrasound_due)}`} {record.ultrasound_result === "pregnant" ? "· Gaabhan" : record.ultrasound_result === "empty" ? "· Khali" : ""}</dd></div>
          <div><dt className="text-muted">Checkup</dt><dd>{record.checkup_date ? shortDate(record.checkup_date) : `Mutawaqqa ${shortDate(record.checkup_due)}`} {record.checkup_result === "pregnant" ? "· Gaabhan" : record.checkup_result === "empty" ? "· Khali" : ""}</dd></div>
          <div><dt className="text-muted">Khushk tareekh</dt><dd>{record.dry_off_date ? shortDate(record.dry_off_date) : `Mutawaqqa ${shortDate(record.dry_off_due)}`}</dd></div>
          <div><dt className="text-muted">Bachay ki mutawaqqa tareekh</dt><dd>{shortDate(record.calving_due)}</dd></div>
          {record.technician && <div><dt className="text-muted">Technician</dt><dd>{record.technician}</dd></div>}
          {record.abortion_date && <div><dt className="text-muted">Hamla zaya</dt><dd>{shortDate(record.abortion_date)}</dd></div>}
          {calving && <div><dt className="text-muted">Asal paidaish</dt><dd>{shortDate(calving.calving_date)} · {calving.outcome === "twins" ? "Joray" : calving.outcome === "alive" ? "Zinda" : "Wafat"}</dd></div>}
        </dl>
        {record.notes && <p className="mt-2 text-sm text-muted">{record.notes}</p>}
        {active && record.status !== "calved" && <button type="button" disabled={busy} onClick={() => { setEditId(editId === record.id ? null : record.id); setEditStatus(record.status); setValidation(""); }} className="mt-3 min-h-10 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem disabled:opacity-50">{editId === record.id ? "Form band karein" : "Record badlein"}</button>}
        {editing?.id === record.id && active && <form key={record.updated_at} onSubmit={save} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">Tukhm rezi ki tareekh<input name="service_date" type="date" required max={today} defaultValue={record.service_date} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Semen ki qism<select name="semen_type" defaultValue={record.semen_type} disabled={busy} className={field}><option value="normal">Normal</option><option value="sexed">Sexed</option><option value="bull">Bull</option></select></label>
          <label className="text-sm font-semibold">Semen ka naam<input name="semen_name" defaultValue={record.semen_name ?? ""} placeholder="Semen ka naam" disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Technician<input name="technician" defaultValue={record.technician ?? ""} placeholder="Technician ka naam" disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Ultrasound ki tareekh<input name="ultrasound_date" type="date" defaultValue={record.ultrasound_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Ultrasound ka nateeja<select name="ultrasound_result" defaultValue={record.ultrasound_result ?? ""} disabled={busy} className={field}><option value="">Abhi nahi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option></select></label>
          <label className="text-sm font-semibold">Checkup ki tareekh<input name="checkup_date" type="date" defaultValue={record.checkup_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Checkup ka nateeja<select name="checkup_result" defaultValue={record.checkup_result ?? ""} disabled={busy} className={field}><option value="">Abhi nahi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option></select></label>
          <label className="text-sm font-semibold">Asal khushk hone ki tareekh<input name="dry_off_date" type="date" defaultValue={record.dry_off_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Haalat<select name="status" value={editStatus} onChange={(event) => setEditStatus(event.target.value)} disabled={busy} className={field}><option value="pending">Nateeja baqi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option><option value="aborted">Hamla zaya</option></select></label>
          {editStatus === "aborted" && <label className="text-sm font-semibold">Hamla zaya ki tareekh<input name="abortion_date" type="date" required defaultValue={record.abortion_date ?? ""} disabled={busy} className={field} /></label>}
          <label className="text-sm font-semibold sm:col-span-2">Notes<input name="notes" defaultValue={record.notes ?? ""} placeholder="Zaroori tafseel" disabled={busy} className={field} /></label>
          <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">Mutawaqqa tareekhein service ki tareekh se khud hisaab hoti hain.</p>
          {validation && <p role="alert" className="text-sm text-udhaar sm:col-span-2 lg:col-span-3">{validation}</p>}
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">Badla hua record save karein</button>
        </form>}
        {active && open && <form onSubmit={(event) => calve(event, record)} className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <label className="text-sm font-semibold">Asal paidaish ki tareekh<input name="calving_date" type="date" required min={record.service_date} max={today} defaultValue={today} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Bachay ka nateeja<select name="outcome" disabled={busy} className={field}><option value="alive">Zinda</option><option value="dead">Wafat</option><option value="twins">Joray</option></select></label>
          <label className="text-sm font-semibold">Notes<input name="notes" placeholder="Bachay ki tafseel" disabled={busy} className={field} /></label>
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">Paidaish darj karein</button>
        </form>}
      </article>;
    })}</div>
  </Panel>;
}
