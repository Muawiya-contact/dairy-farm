"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Body, PageHeader } from "@/components/ui";
import { getSettings, sharedSettings, updateSettings, type FarmSettings } from "@/lib/settings";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-berseem";

function SettingsForm({ initial }: { initial: FarmSettings }) {
  const client = useQueryClient();
  const [farm, setFarm] = useState(initial.farm_name);
  const [owner, setOwner] = useState(initial.owner_name);
  const [rate, setRate] = useState(String(initial.default_milk_rate));
  const [footer, setFooter] = useState(initial.whatsapp_footer);
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (value) => client.setQueryData(["settings"], value),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedRate = Number(rate);
    if (!farm.trim() || !Number.isFinite(parsedRate) || parsedRate <= 0) return;
    mutation.mutate({
      farm_name: farm.trim(), owner_name: owner.trim(), default_milk_rate: parsedRate,
      whatsapp_footer: footer.trim(), ultrasound_days: initial.ultrasound_days,
      checkup_days: initial.checkup_days, dry_off_days: initial.dry_off_days,
      calving_days: initial.calving_days, fresh_days: initial.fresh_days,
    });
  };

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold">Farm ka naam<input required value={farm} onChange={(event) => setFarm(event.target.value)} className={inputClass} /></label>
        <label className="font-semibold">Maalik ka naam<input value={owner} onChange={(event) => setOwner(event.target.value)} className={inputClass} /></label>
        <label className="font-semibold">Doodh ka default rate (Rs/L)<input required type="number" min="0.01" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} /></label>
        <label className="font-semibold">WhatsApp bill ka paigham<input value={footer} onChange={(event) => setFooter(event.target.value)} className={inputClass} /></label>
      </div>
      <button disabled={mutation.isPending || !farm.trim() || Number(rate) <= 0} className="mt-5 min-h-12 rounded-xl bg-berseem px-5 font-bold text-white disabled:opacity-50">{mutation.isPending ? "Save ho raha hai…" : "Save karein"}</button>
      {mutation.isSuccess && <p role="status" className="mt-3 text-berseem-deep">{sharedSettings ? "Settings staging database mein save ho gayi." : "Settings is browser mein save ho gayi."}</p>}
      {mutation.isError && <p role="alert" className="mt-3 text-udhaar">Save nahi hua: {mutation.error.message}</p>}
    </form>
  );
}

export default function SettingsPage() {
  const query = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  return (
    <>
      <PageHeader title="Settings" sub={sharedSettings ? "Staging demo: sab testers ko yahi settings nazar aati hain" : "Preview: sirf is browser mein save hoti hain"} />
      <Body>
        {query.isPending && <p role="status" className="text-muted">Settings load ho rahi hain…</p>}
        {query.isError && <p role="alert" className="text-udhaar">Settings load nahi huin: {query.error.message} <button onClick={() => void query.refetch()} className="underline">Dobara koshish</button></p>}
        {query.data && <SettingsForm initial={query.data} />}
      </Body>
    </>
  );
}
