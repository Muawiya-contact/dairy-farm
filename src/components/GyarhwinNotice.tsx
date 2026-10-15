import { gyarhwinReminder } from "../lib/gyarhwin";
import type { FarmSettings } from "../lib/settings";

export function GyarhwinNotice({ today, settings, className = "" }: { today: string; settings: FarmSettings; className?: string }) {
  const reminder = gyarhwinReminder(today, settings.gyarhwin_reminder_enabled, settings.hijri_date_adjustment);
  if (!reminder) return null;
  return <aside aria-label="Gyarhwin doodh reminder" className={`min-w-0 rounded-2xl border border-berseem bg-berseem-soft p-3 text-ink ${className}`}>
    <h2 className="font-display font-bold">{reminder.title} <span className="text-xs font-normal text-muted">(andazan)</span></h2>
    <p className="mt-1 text-sm">{reminder.message}</p>
  </aside>;
}
