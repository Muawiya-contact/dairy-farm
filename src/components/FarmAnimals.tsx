"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SHIFT_LABELS } from "@/lib/milk-shifts";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { amount, insertRow, longDate, money, shortDate, useFarmData, type Animal } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { parseAmount } from "@/lib/format";
import { animalAge, animalCategoryTitle, animalLifeEvents, compareAnimalTags, matchesAnimalFilter, parseAnimalDates, type AnimalSource } from "@/lib/animal-life";
import { refreshFarmViews } from "@/lib/query-refresh";
import { Body, PageHeader, Panel, StatusTag } from "./ui";
import { FarmLoading } from "./FarmDashboard";
import { PlusIcon, SearchIcon } from "./icons";
import { AnimalManagement } from "./AnimalManagement";
import { AnimalBreeding } from "./AnimalBreeding";
import { AnimalCareTasks } from "./AnimalCareTasks";
import { AnimalHealthHistory } from "./AnimalHealthHistory";
import { breedingDueDate } from "@/lib/breeding-register";
import { UI_TEXT } from "@/lib/text";
import { AnimalProfilePhoto } from "./AnimalProfilePhoto";
import { animalDueTasks, animalProfileStatuses, sevenDayMilkAverage } from "@/lib/animal-profile";
import { buildAnimalDossierPdf, buildAnimalDossierWorkbook, safeAnimalFilename, type AnimalDossier } from "@/lib/animal-dossier";
import { animalPhotoDataUrl } from "@/lib/animal-photos";
import { downloadBlob } from "@/lib/export-data";
import { sharePdfFile } from "@/lib/pdf-share";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const animalLabel = (a: Animal) => `${a.tag}${a.name ? ` · ${a.name}` : ""}`;

export default function FarmAnimals() {
  const id = useSearchParams().get("id") ?? "";
  const query = useFarmData("animals", id);
  const qc = useQueryClient();
  const [add, setAdd] = useState(false);
  const [newSource, setNewSource] = useState<AnimalSource>("purchased");
  const [newSex, setNewSex] = useState<Animal["sex"]>("female");
  const [milkLimit, setMilkLimit] = useState(20);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("active");
  const [dossierBusy, setDossierBusy] = useState(false);
  const [dossierMessage, setDossierMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const selected = d.animals.find((a) => a.id === id);
  const active = d.animals.filter((a) => a.life_status === "active");
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try { await fn(); setAdd(false); try { await refreshFarmViews(qc, "animal"); }
      catch { setError("Record save ho gaya, lekin nayi list nahi khuli. Page dobara kholein."); } }
    catch (e) { setError(friendlyError(e)); if (e instanceof Error && /STALE/.test(e.message)) await refreshFarmViews(qc, "animal"); }
    finally { busyRef.current = false; setBusy(false); }
  };
  if (selected) {
    const status = d.animalStatus.find((x) => x.id === selected.id);
    const history = d.animalMilk.filter((x) => x.animal_id === selected.id).map((x) => ({ ...x, shift: d.shifts.find((s) => s.id === x.shift_id) })).sort((a,b) => (b.shift?.milk_date ?? "").localeCompare(a.shift?.milk_date ?? ""));
    const health = d.health.filter((x) => x.animal_id === selected.id).sort((a,b) => b.event_date.localeCompare(a.event_date));
    const breeding = d.inseminations.filter((x) => x.animal_id === selected.id).sort((a,b) => b.service_date.localeCompare(a.service_date));
    const breedingStatus = d.animalStatus.find((x) => x.id === selected.id)?.breeding_status;
    const profileStatuses = animalProfileStatuses(selected, breedingStatus, health, d.today);
    const currentCycle = breeding.find((record) => record.status === "pending" || record.status === "pregnant");
    const estimatedCalvingDate = currentCycle ? breedingDueDate(currentCycle, "calving").date : status?.calving_due;
    const careTasks = d.animalCareTasks.filter((task) => task.animal_id === selected.id);
    const dueTasks = animalDueTasks({ today: d.today, health, cycle: currentCycle, milking: selected.milking_status === "milking", careTasks });
    const milkByDay = [...history.reduce((groups, row) => {
      const date = row.shift?.milk_date;
      if (date) groups.set(date, (groups.get(date) ?? 0) + amount(row.litres));
      return groups;
    }, new Map<string, number>())].map(([date, litres]) => ({ date, litres }));
    const latestMilkDay = milkByDay.sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestHealth = health[0];
    const dossierInput: AnimalDossier = {
      animal: selected, animals: d.animals, farm: d.settings, today: d.today, status: profileStatuses,
      dueTasks, careTasks, health, healthAttachments: d.healthAttachments, activeAlerts: d.alerts.filter((alert) => alert.animal_id === selected.id),
      inseminations: breeding, calvings: d.calvings, offspring: d.calvingOffspring,
      milk: history.filter((row) => row.shift).map((row) => ({
        date: row.shift!.milk_date, shift: SHIFT_LABELS[row.shift!.shift], litres: amount(row.litres),
      })),
    };
    const exportDossier = async (action: "pdf" | "excel" | "share") => {
      if (dossierBusy) return;
      setDossierBusy(true); setDossierMessage("");
      try {
        let photoDataUrl: string | undefined;
        let photoWarning = false;
        if (selected.photo_path) {
          try { photoDataUrl = await animalPhotoDataUrl(selected.photo_path); }
          catch { photoWarning = true; }
        }
        const input = { ...dossierInput, photoDataUrl };
        if (action === "excel") {
          const bytes = await buildAnimalDossierWorkbook(input);
          downloadBlob(safeAnimalFilename(selected, "xlsx"), new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          setDossierMessage(`Excel record download ho gaya.${photoWarning ? " Tasveer export mein shamil nahi ho saki." : ""}`);
        } else {
          const bytes = await buildAnimalDossierPdf(input);
          const filename = safeAnimalFilename(selected, "pdf");
          if (action === "pdf") {
            downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
            setDossierMessage(`PDF download ho gaya.${photoWarning ? " Tasveer export mein shamil nahi ho saki." : ""}`);
          } else {
            const outcome = await sharePdfFile(filename, bytes, `${d.settings.farm_name} — ${selected.tag}`, `${selected.tag} ka janwar record. Bhejne se pehle recipient check karein.`);
            setDossierMessage(`${outcome === "shared" ? "Device ka share menu khul gaya. Bhejne se pehle recipient check karein." : outcome === "cancelled" ? "Share cancel kar diya gaya." : "PDF download ho gaya. WhatsApp ya doosri app mein khud attach karein."}${photoWarning ? " Tasveer export mein shamil nahi ho saki." : ""}`);
          }
        }
      } catch (failure) { setDossierMessage(`Janwar ka record export nahi hua: ${friendlyError(failure)}`); }
      finally { setDossierBusy(false); }
    };
    const whatsappMessage = `${d.settings.farm_name}: ${selected.tag}${selected.name ? ` (${selected.name})` : ""} ka janwar record. PDF saath attach karein.`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
    const lifeEvents = animalLifeEvents(selected, d);
    const sevenDayAverage = sevenDayMilkAverage(milkByDay, d.today);
    const lifeLabel = { active: "Farm par hai", sold: "Farokht", dead: "Wafat", removed: "Farm se nikla" }[profileStatuses.life];
    const productionLabel = { milking: "Doodh de rahi", dry: "Khushk", none: "Doodh nahi" }[profileStatuses.production];
    const breedingLabel = { pregnant: "Gaabhan", inseminated: "Nateeja baqi", fresh: "Nayi bachhi", open: "Khuli", na: "Laagu nahi", unknown: "Darj nahi" }[profileStatuses.breeding] ?? profileStatuses.breeding;
    const healthLabel = profileStatuses.health === "overdue" ? "Agli sehat ki tareekh guzar gayi" : profileStatuses.health === "scheduled" ? "Sehat ka check-up darj hai" : profileStatuses.health === "no-record" ? "Sehat ka record nahi" : "Agli sehat ki tareekh darj nahi";
    return <><PageHeader title={animalLabel(selected)} sub={`${selected.breed ?? "Nasl darj nahi"} · ${selected.species === "buffalo" ? "Bhains" : "Gaye"}`} back="/janwar/" />
      <Body className="grid gap-4 lg:grid-cols-2 print-report animal-profile-print">
      <AnimalProfilePhoto animal={selected} />
      <Panel title="Janwar ka mukammal record" className="print:hidden">
        <p className="mb-3 text-sm text-muted">Is file mein sirf {selected.tag} aur is se jure khandani record hain. Jo maloomat darj nahi, woh wazeh rahegi.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={dossierBusy} onClick={() => void exportDossier("pdf")} className="min-h-10 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem disabled:opacity-50">PDF download karein</button>
          <button type="button" disabled={dossierBusy} onClick={() => void exportDossier("excel")} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Excel download karein</button>
          <button type="button" disabled={dossierBusy} onClick={() => void exportDossier("share")} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">PDF share karein</button>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-sm font-semibold">WhatsApp kholein</a>
          <button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Print karein</button>
        </div>
        <p className="mt-2 text-xs text-muted">Jahan device share support karta hai, wahan share menu khulega. Warna file download karke WhatsApp par khud attach karein.</p>
        {dossierMessage && <p role={dossierMessage.includes("export nahi hua") ? "alert" : "status"} className="mt-3 text-sm text-muted">{dossierMessage}</p>}
      </Panel>
      <Panel title="Janwar ki maloomat"><dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Farm mein haisiyat</dt><dd><StatusTag status={profileStatuses.life} /><span className="sr-only">{lifeLabel}</span></dd></div>
        <div><dt className="text-muted">Doodh ki haisiyat</dt><dd><StatusTag status={profileStatuses.production} /><span className="sr-only">{productionLabel}</span></dd></div>
        <div><dt className="text-muted">Nasl kashi ki haisiyat</dt><dd>{breedingLabel}</dd></div>
        <div><dt className="text-muted">Sehat ka agla kaam</dt><dd>{healthLabel}{profileStatuses.healthDueDate ? ` · ${longDate(profileStatuses.healthDueDate)}` : ""}</dd></div>
        <div><dt className="text-muted">Paidaish</dt><dd>{selected.birth_date ? longDate(selected.birth_date) : "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Umar</dt><dd>{animalAge(selected, d.today)}</dd></div>
        <div><dt className="text-muted">Farm mein aaya</dt><dd>{selected.arrival_date ? longDate(selected.arrival_date) : "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Aane ka zariya</dt><dd>{{ born: "Farm par paida hua", purchased: "Kharida", gift: "Tohfa", transfer: "Transfer", other: "Doosra" }[selected.source]}</dd></div>
        {selected.mother_id && <div><dt className="text-muted">Maa</dt><dd><Link href={`/janwar/?id=${selected.mother_id}`} className="font-semibold text-berseem underline">{d.animals.find((entry) => entry.id === selected.mother_id)?.tag ?? "Janwar dekhein"}</Link></dd></div>}
        {selected.sire && <div><dt className="text-muted">Semen / baap</dt><dd>{selected.sire}</dd></div>}
        <div><dt className="text-muted">Kharid qeemat</dt><dd>{selected.purchase_price == null ? "Darj nahi" : money(selected.purchase_price)}</dd></div>
        <div><dt className="text-muted">Bechne wala</dt><dd>{selected.seller_name || "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Mandi / jagah</dt><dd>{selected.purchase_location || "Darj nahi"}</dd></div>
        <div><dt className="text-muted">Agli delivery</dt><dd>{estimatedCalvingDate ? longDate(estimatedCalvingDate) : "Darj nahi"}</dd></div>
      </dl>{selected.notes && <p className="mt-3 text-sm text-muted">{selected.notes}</p>}</Panel>
      <Panel title="Aik nazar mein"><dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Aakhri doodh</dt><dd>{latestMilkDay ? `${longDate(latestMilkDay.date)} · ${amount(latestMilkDay.litres)} L` : "Doodh ka record nahi"}</dd></div>
        <div><dt className="text-muted">Saat din ka ausat</dt><dd>{sevenDayAverage.toFixed(2)} L rozana</dd></div>
        <div><dt className="text-muted">Aakhri sehat entry</dt><dd>{latestHealth ? `${latestHealth.title} · ${longDate(latestHealth.event_date)}` : "Sehat ka record nahi"}</dd></div>
        <div><dt className="text-muted">Maujooda nasl kashi</dt><dd>{currentCycle ? `${breedingLabel} · ${longDate(currentCycle.service_date)}` : "Nasl kashi ka khula record nahi"}</dd></div>
      </dl><div className="mt-3 border-t border-line pt-3"><h3 className="font-semibold">Agla due kaam</h3>{dueTasks.length ? <ul className="mt-1 divide-y divide-line text-sm">{dueTasks.map((task) => <li key={`${task.label}-${task.date}`} className="flex flex-wrap justify-between gap-1 py-1"><span>{task.label}{task.overdue ? " · Tareekh guzar gayi" : ""}</span><time>{longDate(task.date)}</time></li>)}</ul> : <p className="mt-1 text-sm text-muted">Koi due tareekh darj nahi.</p>}</div><div className="mt-3 border-t border-line pt-3"><h3 className="font-semibold">Qareebi aham reminders</h3>{dossierInput.activeAlerts.length ? <ul className="mt-1 divide-y divide-line text-sm">{dossierInput.activeAlerts.map((alert) => <li key={`${alert.alert_kind}-${alert.due_date}`} className="py-1">{alert.message}</li>)}</ul> : <p className="mt-1 text-sm text-muted">Is janwar ka koi qareebi reminder nahi.</p>}</div></Panel>
      <AnimalCareTasks animalId={selected.id} tasks={careTasks} today={d.today} active={selected.life_status === "active"} busy={busy} run={run} />
      <div className="print:hidden"><AnimalManagement key={selected.id} animal={selected} animals={d.animals} accounts={d.accounts} today={d.today} linkedBirth={d.calvingOffspring.some((child) => child.animal_id === selected.id)} /></div>
      <Panel title="Farm mein zindagi ka record" className="lg:col-span-2">{!selected.arrival_date && <p className="mb-2 text-sm text-muted">Is purane janwar ki aane ki tareekh darj nahi. Maloom ho to record mein likhein.</p>}{lifeEvents.length ? <ol className="divide-y divide-line">{lifeEvents.map((event) => <li key={event.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[8rem_9rem_1fr]"><time className="text-muted">{longDate(event.date)}</time><strong>{event.title}</strong><span>{event.detail}</span></li>)}</ol> : <p className="text-sm text-muted">Abhi zindagi ka koi tareekhwar record nahi.</p>}</Panel>
      <Panel title={`Doodh ka record (${history.length})`}>{history.length ? <><ul className="divide-y divide-line">{history.slice(0, milkLimit).map((x) => <li key={x.id} className="flex justify-between py-2 text-sm"><span>{x.shift ? shortDate(x.shift.milk_date) : ""} · {x.shift ? SHIFT_LABELS[x.shift.shift] : ""}</span><strong>{amount(x.litres)} L</strong></li>)}</ul>{history.length > milkLimit && <button type="button" onClick={() => setMilkLimit((count) => count + 50)} className="mt-2 min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Mazeed {Math.min(50, history.length - milkLimit)} entries dekhein</button>}</> : <p className="text-sm text-muted">Abhi per-janwar doodh entry nahi.</p>}</Panel>
      <AnimalHealthHistory animalId={selected.id} events={health} attachments={d.healthAttachments} categories={d.categories} accounts={d.accounts} today={d.today} active={selected.life_status === "active"} busy={busy} run={run} />
      <div className="print:hidden"><AnimalBreeding animal={selected} animals={d.animals} records={breeding} calvings={d.calvings.filter((x) => x.animal_id === selected.id)} offspring={d.calvingOffspring} today={d.today} busy={busy} run={run} /></div>
      <Panel title="Record ki tafseel" className="hidden print:block lg:col-span-2">
        <h3 className="font-semibold">Tareekh aur shift ke mutabiq doodh</h3><ul className="divide-y divide-line text-sm">{dossierInput.milk.length ? dossierInput.milk.map((row, index) => <li key={`${row.date}-${row.shift}-${index}`} className="flex justify-between py-1"><span>{longDate(row.date)} · {row.shift}</span><strong>{row.litres} L</strong></li>) : <li className="py-1">Doodh ka record nahi.</li>}</ul>
        <h3 className="mt-4 font-semibold">Nasl kashi ka record</h3><ul className="divide-y divide-line text-sm">{breeding.length ? breeding.map((row) => <li key={row.id} className="py-1">{longDate(row.service_date)} · {row.status} · {row.technician || "Technician darj nahi"}{row.calving_due ? ` · Mutawaqqa paidaish ${longDate(row.calving_due)}` : ""}</li>) : <li className="py-1">Nasl kashi ka record nahi.</li>}</ul>
        <h3 className="mt-4 font-semibold">Paidaish aur bachon ka record</h3><ul className="divide-y divide-line text-sm">{dossierInput.calvings.length ? dossierInput.calvings.map((calving) => {
          const children = dossierInput.offspring.filter((child) => child.calving_id === calving.id);
          const calves = children.map((child) => {
            const tag = child.animal_id ? d.animals.find((item) => item.id === child.animal_id)?.tag : child.tag_at_birth;
            return [tag, child.sex, child.birth_weight_kg == null ? null : `${child.birth_weight_kg} kg`].filter(Boolean).join(" · ");
          }).filter(Boolean);
          if (!calves.length && calving.calf_id) calves.push(d.animals.find((item) => item.id === calving.calf_id)?.tag ?? "Bacha darj hai");
          return <li key={calving.id} className="py-1">{longDate(calving.calving_date)} · {calving.outcome}{calves.length ? ` · ${calves.join("; ")}` : ""}{calving.notes ? ` · ${calving.notes}` : ""}</li>;
        }) : <li className="py-1">Paidaish ka record nahi.</li>}</ul>
        <h3 className="mt-4 font-semibold">Sehat ka record</h3><ul className="divide-y divide-line text-sm">{health.length ? health.map((row) => {
          const attachmentNames = d.healthAttachments.filter((attachment) => attachment.health_event_id === row.id).map((attachment) => attachment.file_name);
          const details = [
            row.symptoms ? `Nishaniyan: ${row.symptoms}` : "", row.diagnosis ? `Vet ki tashkhees: ${row.diagnosis}` : "",
            row.severity ? `Shiddat: ${row.severity}` : "", row.current_condition ? `Maujooda haalat: ${row.current_condition}` : "",
            row.medicine, row.medicine_type ? `Qisam: ${row.medicine_type}` : "", row.dosage ? `Dose: ${row.dosage}` : "",
            row.route ? `Tareeqa: ${row.route}` : "", row.treatment_start_date ? `Shuru: ${longDate(row.treatment_start_date)}` : "",
            row.treatment_end_date ? `Khatam: ${longDate(row.treatment_end_date)}` : "", row.vet ? `Vet: ${row.vet}` : "",
            row.next_due_date ? `Agli due: ${longDate(row.next_due_date)}` : "", Number(row.cost) ? money(row.cost) : "",
            row.notes, attachmentNames.length ? `Files: ${attachmentNames.join(", ")}` : "",
          ].filter(Boolean);
          return <li key={row.id} className="py-1">{longDate(row.event_date)} · {row.kind} · {row.title}{details.length ? ` · ${details.join(" · ")}` : ""}</li>;
        }) : <li className="py-1">Sehat ka record nahi.</li>}</ul>
      </Panel>
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error}</p>}</Body></>;
  }
  const list = d.animals.filter((a) => matchesAnimalFilter(a, filter) && `${a.tag} ${a.name ?? ""} ${a.breed ?? ""}`.toLowerCase().includes(term.toLowerCase())).sort(compareAnimalTags);
  return <><PageHeader title="Janwar" sub={`${active.length} farm par hain, ${active.filter((a) => a.milking_status === "milking").length} doodh de rahe`} action={<button onClick={() => setAdd(!add)} className="flex min-h-11 items-center gap-1 rounded-xl bg-berseem px-4 font-semibold text-white"><PlusIcon width={18} />Naya</button>} />
    <Body><Link href="/nasl/" className="inline-flex min-h-11 items-center rounded-xl border border-berseem px-4 font-semibold text-berseem">Nasl kashi register aur due kaam</Link>{add && <Panel title="Naya janwar"><form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { const dates = parseAnimalDates({ source: newSource, arrival: String(f.get("arrival") ?? ""), birth: String(f.get("birth") ?? ""), estimatedYears: String(f.get("ageYears") ?? ""), estimatedMonths: String(f.get("ageMonths") ?? ""), purchaseDate: String(f.get("purchaseDate") ?? ""), today: d.today }); await insertRow("animals", { tag: String(f.get("tag") ?? "").trim(), name: String(f.get("name") || "").trim() || null, species: String(f.get("species")), breed: String(f.get("breed") || "").trim() || null, sex: newSex, category: String(f.get("category")), milking_status: newSex === "male" ? "none" : String(f.get("milking")), source: newSource, ...dates, purchase_price: newSource === "purchased" && String(f.get("purchasePrice") || "").trim() ? parseAmount(String(f.get("purchasePrice"))) : null, seller_name: newSource === "purchased" ? String(f.get("seller") || "").trim() || null : null, purchase_location: newSource === "purchased" ? String(f.get("purchaseLocation") || "").trim() || null : null, notes: String(f.get("notes") || "").trim() || null }); }); }} className="grid gap-3 sm:grid-cols-2">
      <input name="tag" required placeholder="Tag number" aria-label="Tag number" className={field} /><input name="name" placeholder="Naam (optional)" aria-label="Naam" className={field} /><input name="breed" placeholder="Nasl" aria-label="Nasl" className={field} />
      <select name="species" aria-label="Janwar ki qism" className={field}><option value="cow">Gaye</option><option value="buffalo">Bhains</option></select><select name="sex" aria-label="Jins" value={newSex} onChange={(e) => setNewSex(e.target.value as Animal["sex"])} className={field}><option value="female">Mada</option><option value="male">Nar</option></select><select name="category" aria-label="Umar ka group" className={field}><option value="cow">Bari</option><option value="heifer">Bachhi</option><option value="calf">Bacha</option><option value="bull">Saand</option></select>
      <select name="milking" aria-label="Milk status" disabled={newSex === "male"} className={field}><option value="none">Doodh nahi</option><option value="milking">Doodh de rahi</option><option value="dry">Khushk</option></select>
      <label className="grid gap-1 text-sm text-muted">Aane ka zariya<select name="source" value={newSource} onChange={(e) => setNewSource(e.target.value as AnimalSource)} className={field}><option value="purchased">Kharida</option><option value="born">Farm par paida hua</option><option value="gift">Tohfa</option><option value="transfer">Transfer</option><option value="other">Doosra</option></select></label>
      <label className="grid gap-1 text-sm text-muted">Paidaish ki tareekh {newSource === "born" ? "(zaroori)" : "(agar maloom ho)"}<input name="birth" type="date" max={d.today} required={newSource === "born"} className={field} /></label>
      {newSource !== "born" && <><label className="grid gap-1 text-sm text-muted">Farm mein aane ki tareekh<input name="arrival" type="date" max={d.today} required className={field} /></label><div className="grid gap-2 sm:col-span-2"><p className="text-sm text-muted">Paidaish maloom nahi? Aane ke waqt ki taqreebi umar optional likhein.</p><div className="grid grid-cols-2 gap-2"><input name="ageYears" type="number" min="0" max="50" step="1" aria-label="Taqreebi umar saal" placeholder="Saal" className={field} /><input name="ageMonths" type="number" min="0" max="11" step="1" aria-label="Taqreebi umar maheene" placeholder="Maheene" className={field} /></div></div></>}
      {newSource === "purchased" && <><label className="grid gap-1 text-sm text-muted">Kharid ki tareekh (optional)<input name="purchaseDate" type="date" max={d.today} className={field} /></label><input name="purchasePrice" type="number" min="0" step="0.01" aria-label="Kharid qeemat" placeholder="Kharid qeemat Rs (optional)" className={field} /><input name="seller" maxLength={120} aria-label="Bechne wala" placeholder="Bechne wala (optional)" className={field} /><input name="purchaseLocation" maxLength={160} aria-label="Mandi / khareed ki jagah" placeholder="Mandi / jagah (optional)" className={field} /></>}
      <textarea name="notes" aria-label="Janwar ke notes" placeholder="Janwar ke notes (optional)" className={`${field} min-h-24 py-2 sm:col-span-2`} />
      <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Janwar save karein</button></form></Panel>}
    <label className="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-line bg-paper px-3"><SearchIcon className="text-muted" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tag ya nasal" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
    <div className="my-3 flex gap-2 overflow-x-auto">{[["active",UI_TEXT.active],["all","Sab"],["cow","Gayein"],["buffalo","Bhainsein"],["milking","Doodh"],["dry","Khushk"],["sold","Farokht"],["dead","Wafat"],["removed","Doosre niklay"]].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === value ? "border-ink bg-ink text-white" : "border-line bg-paper"}`}>{label}</button>)}</div>
    <ul className="overflow-hidden rounded-2xl border border-line bg-paper lg:grid lg:grid-cols-2">{list.map((a) => <li key={a.id} className="min-w-0 border-b border-line"><Link href={`/janwar/?id=${a.id}`} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-ground"><span className="flex min-h-12 min-w-14 max-w-32 shrink-0 items-center justify-center break-all rounded-lg border-2 border-berseem px-2 py-1 text-center font-display font-bold leading-tight">{a.tag}</span><span className="min-w-0 flex-1"><strong className="block truncate">{a.name || animalCategoryTitle(a)}</strong><span className="block truncate text-sm text-muted">{a.species === "buffalo" ? "Bhains" : "Gaye"} · {a.breed ?? "Nasl nahi"}</span></span><StatusTag status={a.life_status !== "active" ? a.life_status : a.category === "calf" ? "calf" : a.milking_status} /></Link></li>)}{list.length === 0 && <li className="p-6 text-muted">Koi janwar nahi mila.</li>}</ul>
    {error && <p role="alert" className="mt-3 text-udhaar">Save nahi hua: {error}</p>}</Body></>;
}
