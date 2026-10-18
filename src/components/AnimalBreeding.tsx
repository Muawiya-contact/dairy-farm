"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { insertRow, shortDate, type Animal, type Calving, type CalvingOffspring, type Insemination } from "@/lib/farm-data";
import { parseCalving } from "@/lib/breeding-register";
import { Panel } from "./ui";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { UI_TEXT } from "@/lib/text";
import { friendlyError } from "@/lib/errors";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const statusNames: Record<string, string> = { pending: "Nateeja baqi", pregnant: "Gaabhan", empty: "Khali", aborted: "Hamla zaya", calved: "Bacha paida" };
const semenNames: Record<string, string> = { normal: "Normal", sexed: "Sexed", bull: "Bull" };
const optional = (form: FormData, key: string) => String(form.get(key) ?? "").trim() || null;

function NewbornFields({ index, busy }: { index: number; busy: boolean }) {
  const [outcome, setOutcome] = useState<"alive" | "stillborn">("alive");
  return <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:col-span-2 sm:grid-cols-2"><legend className="px-1 font-semibold">Bacha {index + 1}</legend>
    <label className="text-sm font-semibold">Nateeja<select name={`outcome_${index}`} value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} disabled={busy} className={field}><option value="alive">Zinda</option><option value="stillborn">Paidaish par wafat</option></select></label>
    <label className="text-sm font-semibold">Jins {outcome === "alive" ? "(zaroori)" : "(optional)"}<select name={`sex_${index}`} defaultValue="" required={outcome === "alive"} disabled={busy} className={field}><option value="">Maloom nahi</option><option value="female">Mada</option><option value="male">Nar</option></select></label>
    {outcome === "alive" && <><label className="text-sm font-semibold">Tag (optional)<input name={`tag_${index}`} maxLength={60} placeholder="Khali ho to temporary ID" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Naam (optional)<input name={`name_${index}`} placeholder="Bachay ka naam" disabled={busy} className={field} /></label></>}
    <label className="text-sm font-semibold">Paidaish ka wazan, kg (optional)<input name={`weight_${index}`} type="number" min="0.01" max="999.99" step="0.01" placeholder="Misal: 32.5" disabled={busy} className={field} /></label>
    <label className="text-sm font-semibold">Bachay ka note (optional)<input name={`child_notes_${index}`} placeholder="Zaroori tafseel" disabled={busy} className={field} /></label>
  </fieldset>;
}

export function AnimalBreeding({ animal, animals, records, calvings, offspring, today, busy, run }: {
  animal: Animal; animals: Animal[]; records: Insemination[]; calvings: Calving[]; offspring: CalvingOffspring[]; today: string; busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("pending");
  const [validation, setValidation] = useState("");
  const [calvingValidation, setCalvingValidation] = useState("");
  const [calfCount, setCalfCount] = useState<1 | 2>(1);
  const requests = useRef(new Map<string, string>());
  const newAiForm = useRef<HTMLFormElement>(null);
  const confirming = useRef(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingCalving, setPendingCalving] = useState<{
    recordId: string; values: ReturnType<typeof parseCalving>; form: HTMLFormElement; message: string;
  } | null>(null);
  const editing = records.find((record) => record.id === editId);
  const active = animal.life_status === "active" && animal.sex === "female";
  const hasOpenService = records.some((record) => record.status === "pending" || record.status === "pregnant");
  const current = records[0];
  const currentCalving = calvings.find((item) => item.insemination_id === current?.id);
  const currentCalf = offspring.find((child) => child.calving_id === currentCalving?.id && child.animal_id);
  const currentCalfTag = animals.find((entry) => entry.id === currentCalf?.animal_id)?.tag ?? currentCalf?.tag_at_birth;

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void run(async () => {
      await insertRow("inseminations", {
        animal_id: animal.id, service_date: String(values.get("service_date")),
        semen_type: String(values.get("semen_type")), semen_name: optional(values, "semen_name"),
        semen_batch: optional(values, "semen_batch"),
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
        semen_name: optional(values, "semen_name"), semen_batch: optional(values, "semen_batch"), technician: optional(values, "technician"),
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
    if (busy || confirming.current || pendingCalving) return;
    const form = event.currentTarget;
    let values: ReturnType<typeof parseCalving>;
    try { values = parseCalving(new FormData(form), calfCount, record.service_date, today); }
    catch (error) { setCalvingValidation(error instanceof Error ? error.message : "Paidaish ka form dobara dekhein."); return; }
    setCalvingValidation("");
    const liveCount = values.offspring.filter((child) => child.outcome === "alive").length;
    setPendingCalving({ recordId: record.id, values, form,
      message: UI_TEXT.calvingMessage(animal.tag, shortDate(values.date), values.offspring.length, liveCount) });
  };

  const confirmCalving = () => {
    if (!pendingCalving || busy || confirming.current) return;
    confirming.current = true;
    setConfirmBusy(true);
    const { recordId, values, form } = pendingCalving;
    const requestId = requests.current.get(recordId) ?? crypto.randomUUID();
    requests.current.set(recordId, requestId);
    void run(async () => {
      const { error } = await getSupabase().rpc("record_calving_with_offspring", {
        p_request_id: requestId, p_insemination_id: recordId, p_calving_date: values.date,
        p_offspring: values.offspring, p_ease_score: values.ease, p_notes: values.notes,
      });
      if (error) throw error;
      requests.current.delete(recordId);
      form.reset();
      setCalfCount(1);
    }).catch((error: unknown) => setCalvingValidation(friendlyError(error)))
      .finally(() => { confirming.current = false; setConfirmBusy(false); setPendingCalving(null); });
  };

  return <Panel title="Nasl kashi aur bachay ki paidaish" className="lg:col-span-2">
    {current && <section className="mb-4 rounded-xl border border-line bg-ground p-4" aria-label="Maujooda nasl cycle"><h3 className="font-semibold">Maujooda cycle</h3><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="text-muted">Tag / Nasl</dt><dd>{animal.tag} / {animal.breed || "—"}</dd></div>
      <div><dt className="text-muted">Tukhm rezi</dt><dd>{shortDate(current.service_date)}</dd></div>
      <div><dt className="text-muted">Ultrasound</dt><dd>{current.ultrasound_date ? shortDate(current.ultrasound_date) : `Mutawaqqa ${shortDate(current.ultrasound_due)}`} {current.ultrasound_result ? `· ${current.ultrasound_result === "empty" ? "Khali" : "Gaabhan"}` : ""}</dd></div>
      <div><dt className="text-muted">Haalat</dt><dd>{statusNames[current.status] ?? current.status}</dd></div>
      <div><dt className="text-muted">Checkup</dt><dd>{current.checkup_date ? shortDate(current.checkup_date) : `Mutawaqqa ${shortDate(current.checkup_due)}`}</dd></div>
      <div><dt className="text-muted">Khushk</dt><dd>{current.dry_off_date ? shortDate(current.dry_off_date) : `Mutawaqqa ${shortDate(current.dry_off_due)}`}</dd></div>
      <div><dt className="text-muted">Mutawaqqa paidaish</dt><dd>{shortDate(current.calving_due)}</dd></div>
      <div><dt className="text-muted">Asal paidaish</dt><dd>{currentCalving ? shortDate(currentCalving.calving_date) : "—"}</dd></div>
      <div><dt className="text-muted">Bacha</dt><dd>{currentCalf?.animal_id ? <Link href={`/janwar/?id=${currentCalf.animal_id}`} className="text-berseem underline">{currentCalfTag}</Link> : "—"}</dd></div>
    </dl></section>}
    {animal.sex === "male" && <p className="text-sm text-muted">Nasl kashi aur paidaish ki entries sirf mada janwar ke liye hain.</p>}
    {active && hasOpenService && <p className="text-sm text-muted">Nayi tukhm rezi se pehle khuli entry ka nateeja darj karein.</p>}
    {active && !hasOpenService && current?.status === "empty" && <button type="button" onClick={() => { newAiForm.current?.scrollIntoView({ behavior: "smooth" }); newAiForm.current?.querySelector<HTMLInputElement>('input[name="service_date"]')?.focus(); }} className="mb-3 min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem">Nayi tukhm rezi darj karein</button>}
    {active && !hasOpenService && <form ref={newAiForm} onSubmit={add} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">Nayi tukhm rezi</h3>
      <label className="text-sm font-semibold">Tukhm rezi ki tareekh<input name="service_date" type="date" required min={animal.arrival_date ?? animal.birth_date ?? undefined} max={today} defaultValue={today} disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Semen ki qism<select name="semen_type" disabled={busy} className={field}><option value="normal">Normal</option><option value="sexed">Sexed</option><option value="bull">Bull</option></select></label>
      <label className="text-sm font-semibold">Semen ka naam<input name="semen_name" placeholder="Misal: Irishman" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Semen batch / bull ID (optional)<input name="semen_batch" maxLength={100} placeholder="Misal: Batch 42" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold">Technician<input name="technician" placeholder="Technician ka naam" disabled={busy} className={field} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Notes<input name="notes" placeholder="Zaroori tafseel" disabled={busy} className={field} /></label>
      <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">Tukhm rezi save karein</button>
    </form>}
    {records.length === 0 && <p className="mt-4 text-sm text-muted">Abhi koi nasl kashi record nahi.</p>}
    {pendingCalving && <ConfirmActionDialog title={UI_TEXT.calvingTitle} message={pendingCalving.message}
      confirmLabel={UI_TEXT.calvingButton} busy={busy || confirmBusy} onConfirm={confirmCalving}
      onCancel={() => setPendingCalving(null)} />}
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
          {record.semen_batch && <div><dt className="text-muted">Semen batch / bull ID</dt><dd>{record.semen_batch}</dd></div>}
          {record.abortion_date && <div><dt className="text-muted">Hamla zaya</dt><dd>{shortDate(record.abortion_date)}</dd></div>}
          {calving && <div><dt className="text-muted">Asal paidaish</dt><dd>{shortDate(calving.calving_date)} · {calving.outcome === "twins" ? "Joray" : calving.outcome === "alive" ? "Zinda" : "Wafat"}</dd></div>}
          {calving?.ease_score && <div><dt className="text-muted">Paidaish ka score</dt><dd>{calving.ease_score} / 5</dd></div>}
        </dl>
        {calving && offspring.filter((child) => child.calving_id === calving.id).length > 0 && <ol className="mt-3 grid gap-2 sm:grid-cols-2">{offspring.filter((child) => child.calving_id === calving.id).sort((a, b) => a.birth_order - b.birth_order).map((child) => { const currentTag = animals.find((entry) => entry.id === child.animal_id)?.tag ?? child.tag_at_birth; return <li key={child.id} className="rounded-lg border border-line p-2 text-sm"><strong>Bacha {child.birth_order}: {child.outcome === "alive" ? "Zinda" : "Paidaish par wafat"}</strong>{child.sex && <span> · {child.sex === "female" ? "Mada" : "Nar"}</span>}{child.birth_weight_kg && <span> · {child.birth_weight_kg} kg</span>}{child.animal_id ? <div><Link className="font-semibold text-berseem underline" href={`/janwar/?id=${child.animal_id}`}>{currentTag?.startsWith("TEMP-") ? "Temporary tag: " : "Tag: "}{currentTag}</Link>{currentTag?.startsWith("TEMP-") && <span className="ml-1 text-muted">Janwar ke form se baad mein tag badlein.</span>}</div> : null}{child.notes && <p className="text-muted">{child.notes}</p>}</li>; })}</ol>}
        {record.notes && <p className="mt-2 text-sm text-muted">{record.notes}</p>}
        {active && record.status !== "calved" && <button type="button" disabled={busy} onClick={() => { setEditId(editId === record.id ? null : record.id); setEditStatus(record.status); setValidation(""); }} className="mt-3 min-h-10 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem disabled:opacity-50">{editId === record.id ? "Form band karein" : "Record badlein"}</button>}
        {editing?.id === record.id && active && <form key={record.updated_at} onSubmit={save} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">Tukhm rezi ki tareekh<input name="service_date" type="date" required min={animal.arrival_date ?? animal.birth_date ?? undefined} max={today} defaultValue={record.service_date} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Semen ki qism<select name="semen_type" defaultValue={record.semen_type} disabled={busy} className={field}><option value="normal">Normal</option><option value="sexed">Sexed</option><option value="bull">Bull</option></select></label>
          <label className="text-sm font-semibold">Semen ka naam<input name="semen_name" defaultValue={record.semen_name ?? ""} placeholder="Semen ka naam" disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Semen batch / bull ID (optional)<input name="semen_batch" maxLength={100} defaultValue={record.semen_batch ?? ""} placeholder="Misal: Batch 42" disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Technician<input name="technician" defaultValue={record.technician ?? ""} placeholder="Technician ka naam" disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Ultrasound ki tareekh<input name="ultrasound_date" type="date" defaultValue={record.ultrasound_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Ultrasound ka nateeja<select name="ultrasound_result" defaultValue={record.ultrasound_result ?? ""} disabled={busy} className={field}><option value="">Abhi nahi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option></select></label>
          <label className="text-sm font-semibold">Checkup ki tareekh<input name="checkup_date" type="date" defaultValue={record.checkup_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Checkup ka nateeja<select name="checkup_result" defaultValue={record.checkup_result ?? ""} disabled={busy} className={field}><option value="">Abhi nahi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option></select></label>
          <label className="text-sm font-semibold">Asal khushk hone ki tareekh<input name="dry_off_date" type="date" defaultValue={record.dry_off_date ?? ""} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Haalat<select name="status" value={editStatus} onChange={(event) => setEditStatus(event.target.value)} disabled={busy} className={field}><option value="pending">Nateeja baqi</option><option value="pregnant">Gaabhan</option><option value="empty">Khali</option><option value="aborted">Hamla zaya</option></select></label>
          {editStatus === "aborted" && <label className="text-sm font-semibold">Hamla zaya ki tareekh<input name="abortion_date" type="date" required defaultValue={record.abortion_date ?? ""} disabled={busy} className={field} /></label>}
          <label className="text-sm font-semibold sm:col-span-2">Notes<input name="notes" defaultValue={record.notes ?? ""} placeholder="Zaroori tafseel" disabled={busy} className={field} /></label>
          <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">{UI_TEXT.naslExpectedDates}</p>
          {validation && <p role="alert" className="text-sm text-udhaar sm:col-span-2 lg:col-span-3">{validation}</p>}
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">Badla hua record save karein</button>
        </form>}
        {active && open && <form onSubmit={(event) => calve(event, record)} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <h4 className="font-semibold sm:col-span-2">Paidaish darj karein</h4>
          <label className="text-sm font-semibold">Asal paidaish ki tareekh<input name="calving_date" type="date" required min={record.service_date} max={today} defaultValue={today} disabled={busy} className={field} /></label>
          <label className="text-sm font-semibold">Kitne bachay?<select value={calfCount} onChange={(event) => setCalfCount(Number(event.target.value) as 1 | 2)} disabled={busy} className={field}><option value={1}>Aik</option><option value={2}>Joray (2)</option></select></label>
          {Array.from({ length: calfCount }, (_, index) => <NewbornFields key={index} index={index} busy={busy} />)}
          <label className="text-sm font-semibold">Paidaish ki mushkil, 1 asaan se 5 mushkil (optional)<select name="ease_score" disabled={busy} className={field}><option value="">Darj nahi</option>{[1,2,3,4,5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>
          <label className="text-sm font-semibold">Notes (optional)<input name="notes" placeholder="Maa ya paidaish ki tafseel" disabled={busy} className={field} /></label>
          <p className="text-sm text-muted sm:col-span-2">Zinda bachay ki jins zaroori hai. Tag na ho to temporary ID banegi; baad mein janwar ke record se badal sakte hain.</p>
          {calvingValidation && <p role="alert" className="text-sm text-udhaar sm:col-span-2">{calvingValidation}</p>}
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50 sm:col-span-2">Paidaish aur bachay save karein</button>
        </form>}
      </article>;
    })}</div>
  </Panel>;
}
