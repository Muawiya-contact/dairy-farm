"use client";

import { useState, useSyncExternalStore } from "react";
import { gyarhwinDismissalKey, gyarhwinReminder } from "../lib/gyarhwin";
import type { FarmSettings } from "../lib/settings";

const dismissalEvent = "dairy-farm:gyarhwin-dismissed";

function subscribeDismissal(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(dismissalEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(dismissalEvent, onChange);
  };
}

function isDismissed(key: string) {
  if (!key) return false;
  try { return window.localStorage.getItem(key) === "1"; }
  catch { return false; }
}

export function GyarhwinNotice({ today, settings, className = "" }: { today: string; settings: FarmSettings; className?: string }) {
  const reminder = gyarhwinReminder(today, settings.gyarhwin_reminder_enabled, settings.hijri_date_adjustment);
  const key = reminder ? gyarhwinDismissalKey(today, reminder.phase, settings.hijri_date_adjustment) : "";
  const dismissedInBrowser = useSyncExternalStore(subscribeDismissal, () => isDismissed(key), () => false);
  const [dismissedHere, setDismissedHere] = useState("");
  if (!reminder || dismissedInBrowser || dismissedHere === key) return null;

  const dismiss = () => {
    setDismissedHere(key);
    try { window.localStorage.setItem(key, "1"); }
    catch { /* The card still closes for this visit when browser storage is unavailable. */ }
    window.dispatchEvent(new Event(dismissalEvent));
  };

  return <aside aria-label="Gyarhwin doodh reminder" className={`min-w-0 rounded-2xl border border-berseem bg-berseem-soft p-3 text-ink ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <h2 className="font-display font-bold">{reminder.title} <span className="text-xs font-normal text-muted">(andazan)</span></h2>
      <button type="button" aria-label="Aaj ke liye reminder band karein" title="Aaj ke liye band karein" onClick={dismiss} className="-mr-1 -mt-1 flex min-h-10 min-w-10 items-center justify-center rounded-lg text-xl text-muted hover:bg-berseem hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berseem">×</button>
    </div>
    <p className="mt-1 text-sm">{reminder.message}</p>
  </aside>;
}
