import { gyarhwinDismissalKey, gyarhwinReminder } from "../lib/gyarhwin";
import type { FarmSettings } from "../lib/settings";
import { DismissibleNotice } from "./DismissibleNotice";

export function GyarhwinNotice({ today, settings, className = "" }: { today: string; settings: FarmSettings; className?: string }) {
  const reminder = gyarhwinReminder(today, settings.gyarhwin_reminder_enabled, settings.hijri_date_adjustment);
  if (!reminder) return null;
  return <DismissibleNotice
    storageKey={gyarhwinDismissalKey(today, reminder.phase, settings.hijri_date_adjustment)}
    ariaLabel="Gyarhwin doodh reminder" title={reminder.title} message={reminder.message}
    estimated className={className}
  />;
}
