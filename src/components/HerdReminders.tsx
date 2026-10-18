"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "./icons";
import { getSupabase } from "@/lib/supabase";
import { todayPK } from "@/lib/dates";
import { alertId, bannerCounts, readDismissed, sortedAlerts, writeDismissed } from "@/lib/reminders";
import type { HerdAlert } from "@/lib/farm-data";

const severityLabel = { overdue: "Late", today: "Aaj", soon: "Jald", upcoming: "Aane wala" };
const severityClass = { overdue: "text-udhaar", today: "text-[#8a5b00]", soon: "text-berseem", upcoming: "text-muted" };
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function HerdReminders() {
  const date = todayPK();
  const [open, setOpen] = useState(false);
  const ready = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const [localDismissal, setLocalDismissal] = useState<{ date: string; ids: string[] } | null>(null);
  const query = useQuery({ queryKey: ["herd-alerts", date], queryFn: async () => {
    const { data, error } = await getSupabase().rpc("herd_alerts", { p_today: date });
    if (error) throw error;
    return (data ?? []) as HerdAlert[];
  }, staleTime: 15_000 });
  let savedIds: string[] = [];
  if (ready) {
    try { savedIds = readDismissed(date, window.localStorage); }
    catch { /* Storage can be blocked before its methods are available. */ }
  }
  const dismissed = localDismissal?.date === date ? localDismissal.ids : savedIds;
  const alerts = sortedAlerts(query.data ?? []);
  const counts = ready ? bannerCounts(alerts, dismissed) : null;
  const dismiss = () => {
    const ids = alerts.filter((alert) => alert.severity !== "upcoming").map(alertId);
    setLocalDismissal({ date, ids });
    try { writeDismissed(date, ids, window.localStorage); }
    catch { /* The current visit can still dismiss the banner. */ }
  };
  return <div className="px-4 pt-2 lg:px-8"><div className="flex justify-end"><div className="relative">
      <button type="button" aria-label={`${alerts.length} yaad-dihaniyan`} aria-expanded={open} aria-controls="herd-reminder-list"
        onClick={() => setOpen((value) => !value)} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-paper text-berseem">
        <BellIcon />{alerts.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-udhaar px-1 text-[11px] font-bold text-white">{alerts.length}</span>}
      </button>
      {open && <section id="herd-reminder-list" className="absolute right-0 z-30 mt-2 max-h-96 w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-line bg-paper p-4 shadow-lg" aria-label="Nasl aur sehat ki yaad-dihaniyan">
        <h2 className="font-semibold">Yaad-dihaniyan ({alerts.length})</h2>
        {query.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Yaad-dihaniyan nahi khulein. <button onClick={() => void query.refetch()} className="underline">Dobara koshish</button></p>}
        {!query.isError && alerts.length === 0 && <p className="mt-2 text-sm text-muted">Abhi koi kaam yaad dilane ke liye nahi.</p>}
        <ul className="mt-2 divide-y divide-line">{alerts.map((alert) => <li key={alertId(alert)}><Link href={`/janwar/?id=${alert.animal_id}`} onClick={() => setOpen(false)} className="block py-2 text-sm"><strong className={severityClass[alert.severity]}>{severityLabel[alert.severity]}: </strong>{alert.message}</Link></li>)}</ul>
      </section>}
    </div></div>
    {counts && !open && <aside role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-haldi bg-paper p-3 text-sm">
      <strong>Aaj ke kaam: {counts.overdue} late, {counts.today} aaj, {counts.soon} jald</strong>
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-berseem underline">Dekhein</button>
      <button type="button" onClick={dismiss} className="ml-auto rounded-lg border border-line px-3 py-2 font-semibold">Theek hai</button>
    </aside>}
  </div>;
}
