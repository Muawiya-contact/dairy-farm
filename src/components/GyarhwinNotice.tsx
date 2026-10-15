import Link from "next/link";
import { gyarhwinReminder } from "../lib/gyarhwin";
import type { FarmSettings } from "../lib/settings";

export function GyarhwinNotice({ today, settings, className = "" }: { today: string; settings: FarmSettings; className?: string }) {
  const reminder = gyarhwinReminder(today, settings.gyarhwin_reminder_enabled, settings.hijri_date_adjustment);
  if (!reminder) return null;
  return <aside aria-label="Gyarhwin doodh reminder" className={`min-w-0 rounded-2xl border border-berseem bg-berseem-soft p-4 text-ink ${className}`}>
    <h2 className="font-display text-lg font-bold">{reminder.title} <span className="text-sm font-normal text-muted">(andazan)</span></h2>
    <p className="mt-1 text-sm leading-relaxed">{reminder.message}</p>
    <p className="mt-2 text-xs text-muted">Hijri tareekh maqami chand dekhne se badal sakti hai. <Link href="/settings/" className="font-semibold text-berseem-deep underline">Tareekh adjust karein</Link>.</p>
  </aside>;
}
