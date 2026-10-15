"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { closeAnimal, longDate, money, updateAnimal, type Account, type Animal } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { parseAmount, parsePositiveAmount } from "@/lib/format";
import { parseAnimalDates, type AnimalExit } from "@/lib/animal-life";
import { refreshFarmViews } from "@/lib/query-refresh";
import { Panel } from "./ui";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { UI_TEXT } from "@/lib/text";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const label = "grid gap-1 text-sm text-muted";
const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const optional = (value: FormDataEntryValue | null) => text(value) || null;

export function AnimalManagement({ animal, animals, accounts, today, linkedBirth = false }: {
  animal: Animal; animals: Animal[]; accounts: Account[]; today: string; linkedBirth?: boolean;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"edit" | "exit" | null>(null);
  const [sex, setSex] = useState(animal.sex);
  const [source, setSource] = useState(animal.source);
  const [editVersion, setEditVersion] = useState(animal.updated_at);
  const [exitStatus, setExitStatus] = useState<AnimalExit>("sold");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [pendingExit, setPendingExit] = useState<{ input: Parameters<typeof closeAnimal>[0]; message: string } | null>(null);
  const run = async (save: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      await save();
      setMode(null);
      try { await refreshFarmViews(qc, "animal"); }
      catch { setError("Record save ho gaya, lekin naye hisaab nahi khulay. Page dobara kholein."); }
    } catch (e) {
      if (e instanceof Error && e.message === "ANIMAL_STALE") {
        setMode(null);
        await qc.invalidateQueries({ queryKey: ["farm-data"] });
      }
      setError(friendlyError(e));
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  if (animal.life_status !== "active") return <Panel title="Janwar ka ikhtitam">
    <p className="text-sm">{animal.life_status === "sold" ? "Farokht" : animal.life_status === "dead" ? "Wafat" : "Farm se nikla"} · {animal.exit_date ? longDate(animal.exit_date) : "Darj nahi"}</p>
    {animal.life_status === "sold" && <p className="mt-1 text-sm">Farokht qeemat: {animal.sale_price == null ? "Darj nahi" : money(animal.sale_price)}</p>}
    {animal.exit_reason && <p className="mt-1 text-sm text-muted">{animal.exit_reason}</p>}
  </Panel>;

  return <Panel title="Janwar ka record"><div className="mb-3 flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={() => { if (mode === "edit") setMode(null); else { setEditVersion(animal.updated_at); setSex(animal.sex); setSource(animal.source); setMode("edit"); } setError(""); }} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Maloomat badlein</button>
    <button type="button" disabled={busy} onClick={() => { setMode(mode === "exit" ? null : "exit"); setError(""); }} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Farokht / wafat / doosra</button>
  </div>
    {mode === "edit" && <form key={animal.id} className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void run(() => updateAnimal(animal.id, editVersion, {
        tag: text(f.get("tag")), name: optional(f.get("name")), breed: optional(f.get("breed")),
        category: text(f.get("category")),
        milking_status: sex === "male" ? "none" : text(f.get("milking")),
        ...(!linkedBirth ? { species: text(f.get("species")), sex,
          ...parseAnimalDates({ source, arrival: text(f.get("arrival")), birth: text(f.get("birth")),
          estimatedYears: text(f.get("ageYears")), estimatedMonths: text(f.get("ageMonths")),
          purchaseDate: text(f.get("purchaseDate")), today }),
          mother_id: optional(f.get("mother")), source,
          purchase_price: source !== "purchased" || !text(f.get("purchasePrice")) ? null : parseAmount(text(f.get("purchasePrice"))) } : {}),
        sire: optional(f.get("sire")),
        notes: optional(f.get("notes")),
      }));
    }}>
      <label className={label}>Tag number<input name="tag" required defaultValue={animal.tag} className={field} /></label>
      <label className={label}>Naam<input name="name" defaultValue={animal.name ?? ""} placeholder="Naam (optional)" className={field} /></label>
      <label className={label}>Nasl<input name="breed" defaultValue={animal.breed ?? ""} placeholder="Nasl" className={field} /></label>
      {linkedBirth ? <p className="text-sm text-muted sm:col-span-2">Is bachay ki jins, qism, paidaish ki tareekh, maa aur farm par paida hone ka record paidaish entry se jura hai. Tag, naam aur baqi maloomat yahan badal sakte hain.</p> : <><label className={label}>Qism<select name="species" defaultValue={animal.species} className={field}><option value="cow">Gaye</option><option value="buffalo">Bhains</option></select></label>
      <label className={label}>Jins<select name="sex" value={sex} onChange={(e) => setSex(e.target.value as Animal["sex"])} className={field}><option value="female">Mada</option><option value="male">Nar</option></select></label></>}
      <label className={label}>Umar ka group<select name="category" defaultValue={animal.category} className={field}><option value="cow">Bari</option><option value="heifer">Bachhi</option><option value="calf">Bacha</option><option value="bull">Saand</option></select></label>
      <label className={label}>Doodh ki haalat<select name="milking" defaultValue={animal.milking_status} disabled={sex === "male"} className={field}><option value="none">Doodh nahi</option><option value="milking">Doodh de rahi</option><option value="dry">Khushk</option></select></label>
      {!linkedBirth && <><label className={label}>Paidaish ki tareekh {source === "born" ? "(zaroori)" : "(agar maloom ho)"}<input name="birth" type="date" required={source === "born"} max={today} defaultValue={animal.birth_date ?? ""} className={field} /></label>
      <label className={label}>Maa<select name="mother" defaultValue={animal.mother_id ?? ""} className={field}><option value="">Darj nahi</option>{animals.filter((a) => a.id !== animal.id && a.sex === "female").map((a) => <option value={a.id} key={a.id}>{a.tag}{a.name ? ` · ${a.name}` : ""}</option>)}</select></label></>}
      <label className={label}>Baap / semen<input name="sire" defaultValue={animal.sire ?? ""} placeholder="Naam (optional)" className={field} /></label>
      {!linkedBirth && <><label className={label}>Farm mein aane ka zariya<select name="source" value={source} onChange={(e) => setSource(e.target.value as Animal["source"])} className={field}><option value="purchased">Kharida</option><option value="born">Farm par paida hua</option><option value="gift">Tohfa</option><option value="transfer">Transfer</option><option value="other">Doosra</option></select></label>
      {source !== "born" && <label className={label}>Farm mein aane ki tareekh<input name="arrival" type="date" required max={today} defaultValue={animal.arrival_date ?? ""} className={field} /></label>}
      {source !== "born" && <div className="grid gap-2 sm:col-span-2"><p className="text-sm text-muted">Agar paidaish maloom nahi, aane ke waqt ki taqreebi umar likhein. Dono khali bhi rakh sakte hain.</p><div className="grid grid-cols-2 gap-2"><label className={label}>Umar saal<input name="ageYears" type="number" min="0" max="50" step="1" defaultValue={animal.estimated_age_months_at_arrival == null ? "" : Math.floor(animal.estimated_age_months_at_arrival / 12)} placeholder="Saal" className={field} /></label><label className={label}>Umar maheene<input name="ageMonths" type="number" min="0" max="11" step="1" defaultValue={animal.estimated_age_months_at_arrival == null ? "" : animal.estimated_age_months_at_arrival % 12} placeholder="Maheene" className={field} /></label></div></div>}
      {source === "purchased" && <><label className={label}>Kharid ki tareekh (optional)<input name="purchaseDate" type="date" max={today} defaultValue={animal.purchase_date ?? ""} className={field} /></label><label className={label}>Kharid qeemat<input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={animal.purchase_price ?? ""} placeholder="Rs (optional)" className={field} /></label></>}</>}
      <label className={`${label} sm:col-span-2`}>Notes<textarea name="notes" defaultValue={animal.notes ?? ""} placeholder="Mazeed maloomat" className={`${field} min-h-24 py-2`} /></label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Tabdeeli save karein</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-50">Cancel</button></div>
    </form>}
    {mode === "exit" && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      if (busyRef.current) return;
      let price: number | null = null;
      try { if (exitStatus === "sold") price = parsePositiveAmount(text(f.get("price"))); }
      catch (issue) { setError(friendlyError(issue)); return; }
      const date = text(f.get("date"));
      const action = exitStatus === "sold" ? `farokht ${money(price)}` : exitStatus === "dead" ? "wafat" : "farm se nikalna";
      setPendingExit({ input: { animalId: animal.id, status: exitStatus, date, reason: text(f.get("reason")),
        price, accountId: exitStatus === "sold" ? text(f.get("account")) : null },
        message: UI_TEXT.animalExitMessage(animal.tag, action, longDate(date)) });
    }}>
      <p className="text-sm text-muted sm:col-span-2">Is action ke baad janwar active list aur doodh entry se hat jayega. Sirf farokht ki raqam account mein aayegi.</p>
      <label className={label}>Haalat<select name="status" value={exitStatus} onChange={(e) => setExitStatus(e.target.value as AnimalExit)} className={field}><option value="sold">Farokht</option><option value="dead">Wafat</option><option value="removed">Doosri wajah se nikla</option></select></label>
      <label className={label}>Tareekh<input name="date" type="date" required min={animal.arrival_date ?? animal.birth_date ?? undefined} max={today} defaultValue={today} className={field} /></label>
      {exitStatus === "sold" && <><label className={label}>Mili hui raqam (Rs)<input name="price" type="number" min="0.01" step="0.01" required placeholder="Farokht qeemat" className={field} /></label><label className={label}>Raqam kis account mein aayi<select name="account" required defaultValue="" className={field}><option value="" disabled>Account chunein</option>{accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></>}
      <label className={`${label} sm:col-span-2`}>Wajah / note<input name="reason" required={exitStatus === "removed"} placeholder={exitStatus === "dead" ? "Wafat ki wajah (optional)" : exitStatus === "removed" ? "Farm se kyun nikla?" : "Kharidar ya note (optional)"} className={field} /></label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy || (exitStatus === "sold" && !accounts.some((a) => a.active))} className="min-h-11 rounded-xl bg-udhaar px-4 font-semibold text-white disabled:opacity-50">{exitStatus === "sold" ? "Farokht darj karein" : exitStatus === "dead" ? "Wafat darj karein" : "Ikhtitam darj karein"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-50">Cancel</button></div>
    </form>}
    {!mode && <p className="text-sm text-muted">Record mein tabdeeli ya janwar ka ikhtitam yahan darj karein.</p>}
    {pendingExit && <ConfirmActionDialog title={UI_TEXT.animalExitTitle[pendingExit.input.status]}
      message={pendingExit.message} confirmLabel={UI_TEXT.animalExitButton[pendingExit.input.status]} busy={busy}
      onCancel={() => setPendingExit(null)} onConfirm={() => {
        if (busyRef.current) return;
        const input = pendingExit.input;
        setPendingExit(null);
        void run(() => closeAnimal(input));
      }} />}
    {error && <p role="alert" className="mt-3 text-sm text-udhaar">Save nahi hua: {error}</p>}
  </Panel>;
}
