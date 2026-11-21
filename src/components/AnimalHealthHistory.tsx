"use client";

import { useState, type FormEvent } from "react";
import { money, recordHealthEvent, shortDate, type Account, type ExpenseCategory, type HealthEvent, type HealthEventAttachment } from "@/lib/farm-data";
import { parseAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { signedHealthAttachmentUrl, uploadHealthAttachment, validateHealthAttachment } from "@/lib/animal-health-attachments";
import { Panel } from "./ui";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const kindLabel: Record<string, string> = { vaccine: "Vaccine", treatment: "Ilaj", deworming: "Deworming", checkup: "Vet check-up", other: "Doosra" };
type HealthFilter = "all" | "vaccine" | "deworming";

function HealthAttachments({ event, attachments, busy, run }: {
  event: HealthEvent;
  attachments: HealthEventAttachment[];
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [openingId, setOpeningId] = useState("");
  const [message, setMessage] = useState("");
  const ordered = [...attachments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const openAttachment = async (attachment: HealthEventAttachment) => {
    setOpeningId(attachment.id);
    setMessage("");
    try {
      const url = await signedHealthAttachmentUrl(attachment);
      setLinks((current) => ({ ...current, [attachment.id]: url }));
    } catch (error) { setMessage(`File khul nahi saki: ${friendlyError(error)}`); }
    finally { setOpeningId(""); }
  };
  const upload = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const input = form.elements.namedItem("health-attachment") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const validation = validateHealthAttachment(file);
    if (validation) { setMessage(validation); return; }
    setMessage("");
    if (input) input.value = "";
    void run(async () => {
      await uploadHealthAttachment(event.id, file);
      setMessage("Private file save ho gayi.");
    });
  };
  return <div className="mt-2 rounded-lg bg-ground p-3">
    <h4 className="text-sm font-semibold">Prescription ya report ({ordered.length})</h4>
    {ordered.length > 0 && <ul className="mt-1 grid gap-1 text-sm">{ordered.map((attachment) => <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2">
      <span>{attachment.file_name} · {Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB</span>
      {links[attachment.id] ? <div className="flex flex-wrap gap-2">
        <a href={links[attachment.id]} target="_blank" rel="noreferrer" className="min-h-9 rounded-lg border border-line px-3 py-1 font-semibold underline">File download karein</a>
        <button type="button" disabled={openingId === attachment.id || busy} onClick={() => void openAttachment(attachment)} className="min-h-9 rounded-lg border border-line px-3 py-1 font-semibold disabled:opacity-50">{openingId === attachment.id ? "Naya link ban raha hai" : "Naya private link"}</button>
      </div>
        : <button type="button" disabled={openingId === attachment.id || busy} onClick={() => void openAttachment(attachment)} className="min-h-9 rounded-lg border border-line px-3 py-1 font-semibold disabled:opacity-50">{openingId === attachment.id ? "File khul rahi hai" : "Private file dekhein"}</button>}
    </li>)}</ul>}
    <form onSubmit={upload} className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
      <label className="text-sm">File jorein<input name="health-attachment" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} className="ml-2 max-w-full text-sm" /></label>
      <button disabled={busy} className="min-h-9 rounded-lg border border-berseem px-3 text-sm font-semibold text-berseem disabled:opacity-50">Private file upload</button>
    </form>
    <p className="mt-1 text-xs text-muted">PDF, JPEG ya PNG · 10 MB tak · sirf farm ke authorized user</p>
    {message && <p role="status" className="mt-1 text-xs text-muted">{message}</p>}
  </div>;
}

export function AnimalHealthHistory({ animalId, events, attachments, categories, accounts, today, active, busy, run }: {
  animalId: string;
  events: HealthEvent[];
  attachments: HealthEventAttachment[];
  categories: ExpenseCategory[];
  accounts: Account[];
  today: string;
  active: boolean;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [cost, setCost] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [filter, setFilter] = useState<HealthFilter>("all");
  const history = [...events].filter((event) => filter === "all" || event.kind === filter)
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
  const totalCost = events.reduce((sum, event) => sum + Number(event.cost || 0), 0);
  const farmCategories = categories.filter((category) => category.active && category.is_farm_cost);
  const activeAccounts = accounts.filter((account) => account.active);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const title = String(values.get("title") ?? "").trim();
    const eventDate = String(values.get("date") ?? "");
    const start = String(values.get("treatment_start_date") ?? "") || null;
    const end = String(values.get("treatment_end_date") ?? "") || null;
    if (!title || !eventDate) return;
    if (start && end && end < start) {
      setValidationMessage("Treatment end tareekh, start tareekh se pehle nahi ho sakti.");
      (form.elements.namedItem("treatment_end_date") as HTMLInputElement | null)?.focus();
      return;
    }
    const nextDueDate = String(values.get("next_due_date") || "") || null;
    if (nextDueDate && nextDueDate < eventDate) {
      setValidationMessage("Agli due tareekh, health entry ki tareekh se pehle nahi ho sakti.");
      (form.elements.namedItem("next_due_date") as HTMLInputElement | null)?.focus();
      return;
    }
    setValidationMessage("");
    const expense = Number(values.get("cost") || 0) > 0;
    void run(async () => {
      await recordHealthEvent({
        animalId, date: eventDate, kind: String(values.get("kind")), title,
        cost: expense ? parseAmount(String(values.get("cost"))) : 0,
        nextDueDate,
        categoryId: expense ? String(values.get("category_id") || "") || null : null,
        accountId: expense ? String(values.get("account_id") || "") || null : null,
        medicine: String(values.get("medicine") || "").trim() || null,
        veterinarian: String(values.get("vet") || "").trim() || null,
        notes: String(values.get("notes") || "").trim() || null,
        symptoms: String(values.get("symptoms") || "").trim() || null,
        diagnosis: String(values.get("diagnosis") || "").trim() || null,
        severity: String(values.get("severity") || "") || null,
        currentCondition: String(values.get("current_condition") || "").trim() || null,
        medicineType: String(values.get("medicine_type") || "").trim() || null,
        dosage: String(values.get("dosage") || "").trim() || null,
        route: String(values.get("route") || "").trim() || null,
        treatmentStartDate: start,
        treatmentEndDate: end,
      });
      form.reset();
      setCost(0);
      setValidationMessage("");
    });
  };

  const filters: { id: HealthFilter; label: string }[] = [
    { id: "all", label: "Tamam history" }, { id: "vaccine", label: "Vaccines" }, { id: "deworming", label: "Deworming" },
  ];

  return <Panel title="Sehat aur vet history" className="lg:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted">Health record par darj kharcha — farm expenses ke saath sirf aik dafa ledger mein jata hai.</p>
      <strong className="text-sm">Recorded medical total: {money(totalCost)}</strong>
    </div>
    <p className="mt-1 text-xs text-muted">Tashkhees, dawa aur dose sirf vet/owner ke darj karda notes hain; app medical advice nahi deti.</p>
    {active && <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">Nayi health ya vaccine entry</h3>
      <label className="text-sm font-semibold">Entry ka naam<input name="title" required maxLength={180} placeholder="Misal: FMD vaccination" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Entry ki qism<select name="kind" aria-label="Health record type" className={field} disabled={busy}>{Object.entries(kindLabel).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Tareekh<input name="date" type="date" required max={today} defaultValue={today} className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Symptoms / nishaniyan<textarea name="symptoms" maxLength={1000} className={field} rows={2} disabled={busy} /></label>
      <label className="text-sm font-semibold">Vet ki likhi tashkhees<input name="diagnosis" maxLength={300} className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Shiddat (optional)<select name="severity" defaultValue="" className={field} disabled={busy}><option value="">Darj nahi</option><option value="mild">Halki</option><option value="moderate">Darmiyani</option><option value="severe">Zyada</option></select></label>
      <label className="text-sm font-semibold">Maujooda haalat<input name="current_condition" maxLength={300} placeholder="Vet/owner ke notes" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Medicine / vaccine product<input name="medicine" maxLength={180} placeholder="Product ka naam" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Medicine ki qisam<input name="medicine_type" maxLength={120} placeholder="Vet ke mutabiq" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Dose<input name="dosage" maxLength={120} placeholder="Vet ke likhay mutabiq" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Dene ka tareeqa<input name="route" maxLength={120} placeholder="Agar maloom ho" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Treatment start<input name="treatment_start_date" type="date" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Treatment end<input name="treatment_end_date" type="date" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Veterinarian<input name="vet" maxLength={180} className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Agli due tareekh<input name="next_due_date" type="date" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Kharcha Rs<input name="cost" type="number" min="0" step="0.01" aria-label="Kharcha" className={field} onChange={(event) => setCost(Number(event.target.value) || 0)} disabled={busy} /></label>
      {cost > 0 && <>
        <label className="text-sm font-semibold">Kharcha category<select name="category_id" required className={field} disabled={busy}>{farmCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Kharcha account<select name="account_id" required className={field} disabled={busy}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      </>}
      <label className="text-sm font-semibold sm:col-span-2 lg:col-span-3">Notes<textarea name="notes" maxLength={1000} rows={2} className={field} disabled={busy} /></label>
      {validationMessage && <p role="alert" className="text-sm text-udhaar sm:col-span-2 lg:col-span-3">{validationMessage}</p>}
      <button disabled={busy || (cost > 0 && (!farmCategories.length || !activeAccounts.length))} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">Health entry save</button>
    </form>}
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Health history filter">
      {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${filter === item.id ? "border-berseem bg-ground text-berseem" : "border-line"}`}>{item.label}</button>)}
    </div>
    {history.length ? <ol className="mt-2 divide-y divide-line">{history.map((event) => {
      const eventAttachments = attachments.filter((attachment) => attachment.health_event_id === event.id);
      return <li key={event.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><div>
          <strong>{event.title}</strong> · {shortDate(event.event_date)} · {kindLabel[event.kind] ?? event.kind}
          {(event.medicine || event.medicine_type) && <p>Product: {[event.medicine, event.medicine_type].filter(Boolean).join(" · ")}</p>}
          {(event.symptoms || event.diagnosis) && <p>{event.symptoms ? `Symptoms: ${event.symptoms}` : ""}{event.symptoms && event.diagnosis ? " · " : ""}{event.diagnosis ? `Vet ki tashkhees: ${event.diagnosis}` : ""}</p>}
          {(event.severity || event.current_condition) && <p>Severity / haalat: {[event.severity, event.current_condition].filter(Boolean).join(" · ")}</p>}
          {(event.dosage || event.route) && <p>Vet ki treatment tafseel: {[event.dosage, event.route].filter(Boolean).join(" · ")}</p>}
          {(event.treatment_start_date || event.treatment_end_date) && <p>Treatment: {event.treatment_start_date ? shortDate(event.treatment_start_date) : "—"} – {event.treatment_end_date ? shortDate(event.treatment_end_date) : "—"}</p>}
          {event.vet && <p>Vet: {event.vet}</p>}{event.notes && <p>Notes: {event.notes}</p>}
          {event.next_due_date && <p className="font-semibold text-berseem">Agli due tareekh: {shortDate(event.next_due_date)}</p>}
        </div><div className="text-right">{Number(event.cost) > 0 ? <strong>{money(event.cost)}</strong> : null}{event.expense_id && <p className="text-xs text-muted">Expense ledger mein linked</p>}</div></div>
        <HealthAttachments event={event} attachments={eventAttachments} busy={busy} run={run} />
      </li>;
    })}</ol> : <p className="mt-3 text-sm text-muted">Is filter mein health record nahi.</p>}
  </Panel>;
}
