"use client";

import { useState, useSyncExternalStore } from "react";

const dismissalEvent = "dairy-farm:daily-notice-dismissed";

function subscribeDismissal(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(dismissalEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(dismissalEvent, onChange);
  };
}

function isDismissed(key: string) {
  try { return window.localStorage.getItem(key) === "1"; }
  catch { return false; }
}

export function DismissibleNotice({ storageKey, ariaLabel, title, message, estimated = false, tone = "milk", className = "" }: {
  storageKey: string; ariaLabel: string; title: string; message: string; estimated?: boolean;
  tone?: "milk" | "eid"; className?: string;
}) {
  const dismissedInBrowser = useSyncExternalStore(subscribeDismissal, () => isDismissed(storageKey), () => false);
  const [dismissedHere, setDismissedHere] = useState("");
  if (dismissedInBrowser || dismissedHere === storageKey) return null;

  const dismiss = () => {
    setDismissedHere(storageKey);
    try { window.localStorage.setItem(storageKey, "1"); }
    catch { /* The card still closes for this visit when browser storage is unavailable. */ }
    window.dispatchEvent(new Event(dismissalEvent));
  };

  const colors = tone === "eid" ? "border-[#dcbf75] bg-[#fff8e8]" : "border-berseem bg-berseem-soft";
  return <aside aria-label={ariaLabel} className={`min-w-0 rounded-2xl border p-3 text-ink ${colors} ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <h2 className="font-display font-bold">{title} {estimated && <span className="text-xs font-normal text-muted">(andazan)</span>}</h2>
      <button type="button" aria-label="Aaj ke liye reminder band karein" title="Aaj ke liye band karein" onClick={dismiss} className="-mr-1 -mt-1 flex min-h-10 min-w-10 items-center justify-center rounded-lg text-xl text-muted hover:bg-berseem hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berseem">×</button>
    </div>
    <p className="mt-1 text-sm">{message}</p>
  </aside>;
}
