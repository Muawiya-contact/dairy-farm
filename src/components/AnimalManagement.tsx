"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { closeAnimal, longDate, money, updateAnimal, type Account, type Animal } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { parseAmount, parsePositiveAmount } from "@/lib/format";
import { Panel } from "./ui";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const label = "grid gap-1 text-sm text-muted";
const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const optional = (value: FormDataEntryValue | null) => text(value) || null;

export function AnimalManagement({ animal, animals, accounts, today }: {
  animal: Animal; animals: Animal[]; accounts: Account[]; today: string;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"edit" | "exit" | null>(null);
  const [sex, setSex] = useState(animal.sex);
  const [source, setSource] = useState(animal.source);
  const [editVersion, setEditVersion] = useState(animal.updated_at);
  const [exitStatus, setExitStatus] = useState<"sold" | "dead">("sold");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (save: () => Promise<void>) => {
    setBusy(true); setError("");
    try {
      await save();
      await qc.invalidateQueries({ queryKey: ["farm-data"] });
      setMode(null);
    } catch (e) {
      if (e instanceof Error && e.message === "ANIMAL_STALE") {
        setMode(null);
        await qc.invalidateQueries({ queryKey: ["farm-data"] });
      }
      setError(friendlyError(e));
    }
    finally { setBusy(false); }
  };

  if (animal.life_status !== "active") return <Panel title="Janwar ka ikhtitam">
    <p className="text-sm">{animal.life_status === "sold" ? "Farokht" : "Wafat"} · {animal.exit_date ? longDate(animal.exit_date) : "Darj nahi"}</p>
    {animal.life_status === "sold" && <p className="mt-1 text-sm">Farokht qeemat: {animal.sale_price == null ? "Darj nahi" : money(animal.sale_price)}</p>}
    {animal.exit_reason && <p className="mt-1 text-sm text-muted">{animal.exit_reason}</p>}
  </Panel>;

  return <Panel title="Janwar ka record"><div className="mb-3 flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={() => { if (mode === "edit") setMode(null); else { setEditVersion(animal.updated_at); setSex(animal.sex); setSource(animal.source); setMode("edit"); } setError(""); }} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Maloomat badlein</button>
    <button type="button" disabled={busy} onClick={() => { setMode(mode === "exit" ? null : "exit"); setError(""); }} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Farokht / wafat</button>
  </div>
    {mode === "edit" && <form key={animal.id} className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void run(() => updateAnimal(animal.id, editVersion, {
        tag: text(f.get("tag")), name: optional(f.get("name")), breed: optional(f.get("breed")),
        species: text(f.get("species")), sex, category: text(f.get("category")),
        milking_status: sex === "male" ? "none" : text(f.get("milking")),
        birth_date: optional(f.get("birth")), mother_id: optional(f.get("mother")),
        sire: optional(f.get("sire")), source,
        purchase_date: source === "born" ? null : optional(f.get("purchaseDate")),
        purchase_price: source === "born" || !text(f.get("purchasePrice")) ? null : parseAmount(text(f.get("purchasePrice"))),
        notes: optional(f.get("notes")),
      }));
    }}>
      <label className={label}>Tag number<input name="tag" required defaultValue={animal.tag} className={field} /></label>
      <label className={label}>Naam<input name="name" defaultValue={animal.name ?? ""} placeholder="Naam (optional)" className={field} /></label>
      <label className={label}>Nasl<input name="breed" defaultValue={animal.breed ?? ""} placeholder="Nasl" className={field} /></label>
      <label className={label}>Qism<select name="species" defaultValue={animal.species} className={field}><option value="cow">Gaye</option><option value="buffalo">Bhains</option></select></label>
      <label className={label}>Jins<select name="sex" value={sex} onChange={(e) => setSex(e.target.value as Animal["sex"])} className={field}><option value="female">Female</option><option value="male">Male</option></select></label>
      <label className={label}>Umar ka group<select name="category" defaultValue={animal.category} className={field}><option value="cow">Bari</option><option value="heifer">Heifer</option><option value="calf">Bacha</option><option value="bull">Bull</option></select></label>
      <label className={label}>Doodh ki haalat<select name="milking" defaultValue={animal.milking_status} disabled={sex === "male"} className={field}><option value="none">Doodh nahi</option><option value="milking">Doodh de rahi</option><option value="dry">Khushk</option></select></label>
      <label className={label}>Paidaish<input name="birth" type="date" max={today} defaultValue={animal.birth_date ?? ""} className={field} /></label>
      <label className={label}>Maa<select name="mother" defaultValue={animal.mother_id ?? ""} className={field}><option value="">Darj nahi</option>{animals.filter((a) => a.id !== animal.id && a.sex === "female").map((a) => <option value={a.id} key={a.id}>{a.tag}{a.name ? ` · ${a.name}` : ""}</option>)}</select></label>
      <label className={label}>Baap / semen<input name="sire" defaultValue={animal.sire ?? ""} placeholder="Naam (optional)" className={field} /></label>
      <label className={label}>Aane ka tareeqa<select name="source" value={source} onChange={(e) => setSource(e.target.value as Animal["source"])} className={field}><option value="purchased">Kharida</option><option value="born">Farm par paida hua</option></select></label>
      {source === "purchased" && <><label className={label}>Kharid ki tareekh<input name="purchaseDate" type="date" max={today} defaultValue={animal.purchase_date ?? ""} className={field} /></label><label className={label}>Kharid qeemat<input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={animal.purchase_price ?? ""} placeholder="Rs (optional)" className={field} /></label></>}
      <label className={`${label} sm:col-span-2`}>Notes<textarea name="notes" defaultValue={animal.notes ?? ""} placeholder="Mazeed maloomat" className={`${field} min-h-24 py-2`} /></label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">Tabdeeli save karein</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-50">Cancel</button></div>
    </form>}
    {mode === "exit" && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void run(() => closeAnimal({ animalId: animal.id, status: exitStatus, date: text(f.get("date")), reason: text(f.get("reason")),
        price: exitStatus === "sold" ? parsePositiveAmount(text(f.get("price"))) : null,
        accountId: exitStatus === "sold" ? text(f.get("account")) : null }));
    }}>
      <p className="text-sm text-muted sm:col-span-2">Is action ke baad janwar active list aur doodh entry se hat jayega. Farokht ki raqam accounts mein bhi darj hogi.</p>
      <label className={label}>Haalat<select name="status" value={exitStatus} onChange={(e) => setExitStatus(e.target.value as "sold" | "dead")} className={field}><option value="sold">Farokht</option><option value="dead">Wafat</option></select></label>
      <label className={label}>Tareekh<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
      {exitStatus === "sold" && <><label className={label}>Mili hui raqam (Rs)<input name="price" type="number" min="0.01" step="0.01" required placeholder="Farokht qeemat" className={field} /></label><label className={label}>Raqam kis account mein aayi<select name="account" required defaultValue="" className={field}><option value="" disabled>Account chunein</option>{accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></>}
      <label className={`${label} sm:col-span-2`}>Wajah / note<input name="reason" placeholder={exitStatus === "dead" ? "Wafat ki wajah (optional)" : "Kharidar ya note (optional)"} className={field} /></label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy || (exitStatus === "sold" && !accounts.some((a) => a.active))} className="min-h-11 rounded-xl bg-udhaar px-4 font-semibold text-white disabled:opacity-50">{exitStatus === "sold" ? "Farokht darj karein" : "Wafat darj karein"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-50">Cancel</button></div>
    </form>}
    {!mode && <p className="text-sm text-muted">Record mein tabdeeli ya janwar ka ikhtitam yahan darj karein.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-udhaar">Save nahi hua: {error}</p>}
  </Panel>;
}
