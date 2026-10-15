"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Body, PageHeader } from "@/components/ui";
import { breedingFields, getSettings, updateSettings, validateSettings, type FarmSettings } from "@/lib/settings";
import { parseAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { createAccount, getAccounts, updateAccount, validateAccount, type FarmAccount } from "@/lib/accounts";
import { formatDay, todayPK } from "@/lib/dates";
import { ExportPanel } from "@/components/ExportPanel";
import { estimatedHijriDate, nextGyarhwinDate } from "@/lib/gyarhwin";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-berseem";

function SettingsForm({ initial }: { initial: FarmSettings }) {
  const client = useQueryClient();
  const [farm, setFarm] = useState(initial.farm_name);
  const [owner, setOwner] = useState(initial.owner_name);
  const [contactPhone, setContactPhone] = useState(initial.contact_phone);
  const [rate, setRate] = useState(String(initial.default_milk_rate));
  const [footer, setFooter] = useState(initial.whatsapp_footer);
  const [gyarhwinEnabled, setGyarhwinEnabled] = useState(initial.gyarhwin_reminder_enabled);
  const [hijriAdjustment, setHijriAdjustment] = useState(String(initial.hijri_date_adjustment));
  const [days, setDays] = useState(() => Object.fromEntries(breedingFields.map(({ key }) => [key, String(initial[key])])) as Record<(typeof breedingFields)[number]["key"], string>);
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (value) => { client.setQueryData(["settings"], value); void client.invalidateQueries({ queryKey: ["farm-data"] }); },
  });
  const edit = () => { setValidation(""); mutation.reset(); };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation("");
    let parsedRate: number;
    try { parsedRate = parseAmount(rate); }
    catch { setValidation("Doodh ka sahi rate likhein."); return; }
    const values = {
      farm_name: farm.trim(), owner_name: owner.trim(), contact_phone: contactPhone.trim(), default_milk_rate: parsedRate,
      whatsapp_footer: footer.trim(), ultrasound_days: Number(days.ultrasound_days),
      checkup_days: Number(days.checkup_days), dry_off_days: Number(days.dry_off_days),
      calving_days: Number(days.calving_days), fresh_days: Number(days.fresh_days),
      gyarhwin_reminder_enabled: gyarhwinEnabled, hijri_date_adjustment: Number(hijriAdjustment),
    };
    const issue = validateSettings(values);
    if (issue) { setValidation(issue); return; }
    mutation.mutate(values);
  };

  return (
    <form noValidate onSubmit={submit} className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold">Farm ka naam<input required disabled={mutation.isPending} placeholder="Farm ka naam" value={farm} onChange={(event) => { edit(); setFarm(event.target.value); }} className={inputClass} /></label>
        <label className="font-semibold">Maalik ka naam<input disabled={mutation.isPending} placeholder="Maalik ka naam" value={owner} onChange={(event) => { edit(); setOwner(event.target.value); }} className={inputClass} /></label>
        <label className="font-semibold">Farm ka contact number<input disabled={mutation.isPending} type="tel" inputMode="tel" placeholder="03xxxxxxxxx (optional)" value={contactPhone} onChange={(event) => { edit(); setContactPhone(event.target.value); }} className={inputClass} /><span className="mt-1 block text-xs font-normal text-muted">Bill aur receipt PDF par nazar aayega.</span></label>
        <label className="font-semibold">Doodh ka default rate (Rs/L)<input required disabled={mutation.isPending} type="number" min="0.01" step="0.01" placeholder="Misal: 150" value={rate} onChange={(event) => { edit(); setRate(event.target.value); }} className={inputClass} /></label>
        <label className="font-semibold">WhatsApp bill ka paigham<input disabled={mutation.isPending} placeholder="Bill ke neeche paigham" value={footer} onChange={(event) => { edit(); setFooter(event.target.value); }} className={inputClass} /></label>
      </div>
      <fieldset className="mt-5"><legend className="font-display text-lg font-bold">Nasl kashi ke din</legend><p className="mb-3 text-sm text-muted">Tabdeeli sirf nayi entries par lagegi.</p>
        <div className="grid gap-4 sm:grid-cols-2">{breedingFields.map(({ key, label, min, max }) => <label key={key} className="font-semibold">{label} (din)<input required disabled={mutation.isPending} type="number" min={min} max={max} step="1" placeholder={`${min}–${max} din`} value={days[key]} onChange={(event) => { edit(); setDays((current) => ({ ...current, [key]: event.target.value })); }} className={inputClass} /></label>)}</div>
      </fieldset>
      <fieldset className="mt-5 border-t border-line pt-5"><legend className="font-display text-lg font-bold">Gyarhwin doodh reminder</legend>
        <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" disabled={mutation.isPending} checked={gyarhwinEnabled} onChange={(event) => { edit(); setGyarhwinEnabled(event.target.checked); }} /> Har Hijri maheene ki 10 aur 11 tareekh par yaad dilayein</label>
        <p className="mt-2 text-sm text-muted">Yeh sirf yaad-dihani hai. Doodh ki miktar ya customer delivery khud se nahi badlegi.</p>
        <label className="mt-3 block max-w-xs font-semibold">Hijri tareekh adjust (din)
          <select disabled={mutation.isPending} value={hijriAdjustment} onChange={(event) => { edit(); setHijriAdjustment(event.target.value); }} className={inputClass}>
            <option value="-2">-2 din</option><option value="-1">-1 din</option><option value="0">0 din</option><option value="1">+1 din</option><option value="2">+2 din</option>
          </select>
        </label>
        <p className="mt-2 text-sm text-muted">Aaj ki andazi Hijri tareekh: {(() => { const hijri = estimatedHijriDate(todayPK(), Number(hijriAdjustment)); return hijri ? `${hijri.day}/${hijri.month}/${hijri.year}` : "is browser mein dikhai nahi ja sakti"; })()}. Agli Gyarhwin: {(() => { const day = nextGyarhwinDate(todayPK(), Number(hijriAdjustment)); return day ? formatDay(day) : "maloom nahi"; })()}. Maqami Ruet-e-Hilal elaan se milayein; tareekh badalne par adjustment dobara dekhein.</p>
      </fieldset>
      <button disabled={mutation.isPending} className="mt-5 min-h-12 rounded-xl bg-berseem px-5 font-bold text-white disabled:opacity-50">{mutation.isPending ? "Save ho raha hai…" : "Save karein"}</button>
      {validation && <p role="alert" className="mt-3 text-udhaar">{validation}</p>}
      {mutation.isSuccess && <p role="status" className="mt-3 text-berseem-deep">Settings Supabase mein save ho gayi.</p>}
      {mutation.isError && <p role="alert" className="mt-3 text-udhaar">Save nahi hua: {friendlyError(mutation.error)}</p>}
    </form>
  );
}

function AccountEditor({ account }: { account: FarmAccount }) {
  const client = useQueryClient();
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(account.opening_balance === 0 ? "" : String(account.opening_balance));
  const [date, setDate] = useState(account.opening_date);
  const [active, setActive] = useState(account.active);
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: () => updateAccount(account.id, { name, opening_balance: Number(balance), opening_date: date, active }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["accounts"] }); void client.invalidateQueries({ queryKey: ["farm-data"] }); },
  });
  const edit = () => { setValidation(""); mutation.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setValidation("");
    const issue = validateAccount({ name, opening_balance: Number(balance), opening_date: date, active }, account.is_farm_cash);
    if (issue) { setValidation(issue); return; }
    mutation.mutate();
  };
  return <form onSubmit={submit} className="rounded-xl border border-line p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">{account.is_farm_cash ? "Farm galla" : account.kind === "bank" ? "Bank" : account.kind === "person" ? "Person" : "Cash"}</h3><span className="text-sm text-muted">{account.active ? "Active" : "Band"}</span></div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Naam<input required disabled={mutation.isPending} placeholder="Account ka naam" value={name} onChange={(event) => { edit(); setName(event.target.value); }} className={inputClass} /></label>
      <label className="text-sm font-semibold">Opening balance (Rs)<input disabled={mutation.isPending} type="number" step="0.01" placeholder="Khali = Rs 0" value={balance} onChange={(event) => { edit(); setBalance(event.target.value); }} className={inputClass} /></label>
      <label className="text-sm font-semibold">Opening date<input required disabled={mutation.isPending} type="date" max={todayPK()} value={date} onChange={(event) => { edit(); setDate(event.target.value); }} className={inputClass} /></label></div>
    <div className="mt-3 flex flex-wrap items-center gap-4"><label className="text-sm font-semibold"><input type="checkbox" checked={active} disabled={account.is_farm_cash || mutation.isPending} onChange={(event) => { edit(); setActive(event.target.checked); }} /> Active</label>
      <button disabled={mutation.isPending} className="min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">{mutation.isPending ? "Save ho raha hai…" : "Account save karein"}</button></div>
    {account.is_farm_cash && <p className="mt-2 text-sm text-muted">Farm galla band nahi ho sakta.</p>}
    {validation && <p role="alert" className="mt-2 text-udhaar">{validation}</p>}
    {mutation.isError && <p role="alert" className="mt-2 text-udhaar">{friendlyError(mutation.error)}</p>}
    {mutation.isSuccess && <p role="status" className="mt-2 text-berseem-deep">Account save ho gaya.</p>}
  </form>;
}

function AccountsSection() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cash" | "bank" | "person">("bank");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(() => todayPK());
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: () => createAccount({ name, kind, opening_balance: Number(balance), opening_date: date, active: true }),
    onSuccess: () => { setName(""); setBalance(""); void client.invalidateQueries({ queryKey: ["accounts"] }); void client.invalidateQueries({ queryKey: ["farm-data"] }); },
  });
  const edit = () => { setValidation(""); mutation.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setValidation("");
    const issue = validateAccount({ name, opening_balance: Number(balance), opening_date: date, active: true });
    if (issue) { setValidation(issue); return; }
    mutation.mutate();
  };
  return <section className="max-w-2xl rounded-2xl border border-line bg-paper p-5"><h2 className="font-display text-xl font-bold">Accounts</h2><p className="mt-1 text-sm text-muted">Opening balance badalne se purana hisaab bhi badlega.</p>
    {query.isPending && <p role="status" className="mt-3 text-muted">Accounts load ho rahe hain…</p>}
    {query.isError && <p role="alert" className="mt-3 text-udhaar">{friendlyError(query.error)} <button onClick={() => void query.refetch()} className="underline">Dobara koshish</button></p>}
    {query.data && <div className="mt-4 grid gap-3">{query.data.map((account) => <AccountEditor key={account.id} account={account} />)}</div>}
    <form onSubmit={submit} className="mt-5 border-t border-line pt-4"><h3 className="font-semibold">Naya account</h3><div className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Naam<input required disabled={mutation.isPending} placeholder="Account ka naam" value={name} onChange={(event) => { edit(); setName(event.target.value); }} className={inputClass} /></label>
      <label className="text-sm font-semibold">Qism<select disabled={mutation.isPending} value={kind} onChange={(event) => { edit(); setKind(event.target.value as typeof kind); }} className={inputClass}><option value="cash">Cash</option><option value="bank">Bank</option><option value="person">Person</option></select></label>
      <label className="text-sm font-semibold">Opening balance (Rs)<input disabled={mutation.isPending} type="number" step="0.01" placeholder="Khali = Rs 0" value={balance} onChange={(event) => { edit(); setBalance(event.target.value); }} className={inputClass} /></label>
      <label className="text-sm font-semibold">Opening date<input required disabled={mutation.isPending} type="date" max={todayPK()} value={date} onChange={(event) => { edit(); setDate(event.target.value); }} className={inputClass} /></label></div>
      <button disabled={mutation.isPending} className="mt-3 min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white disabled:opacity-50">{mutation.isPending ? "Save ho raha hai…" : "Account shamil karein"}</button>
      {validation && <p role="alert" className="mt-2 text-udhaar">{validation}</p>}
      {mutation.isError && <p role="alert" className="mt-2 text-udhaar">{friendlyError(mutation.error)}</p>}
      {mutation.isSuccess && <p role="status" className="mt-2 text-berseem-deep">Account shamil ho gaya.</p>}
    </form>
  </section>;
}

export default function SettingsPage() {
  const query = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  return (
    <>
      <PageHeader title="Settings" sub="Farm ki maloomat" />
      <Body className="grid gap-5">
        {query.isPending && <p role="status" className="text-muted">Settings load ho rahi hain…</p>}
        {query.isError && <p role="alert" className="text-udhaar">Settings load nahi huin: {friendlyError(query.error)} <button onClick={() => void query.refetch()} className="underline">Dobara koshish</button></p>}
        {query.data && <SettingsForm initial={query.data} />}
        <AccountsSection />
        <ExportPanel />
      </Body>
    </>
  );
}
