import { daysBetween } from "./dates";
import type { FarmSettings } from "./settings";

export type ConfirmedEid = { kind: "fitr" | "adha"; label: string; startDate: string; day: 1 | 2 | 3 };

// Only a date saved in Settings can trigger a greeting; estimates cannot.
// Adha has priority if invalid external data ever makes both ranges overlap.
export function confirmedEidForDate(today: string, settings: Pick<FarmSettings, "eid_fitr_start_date" | "eid_adha_start_date">): ConfirmedEid | null {
  for (const [kind, label, startDate] of [
    ["adha", "Eid ul Adha", settings.eid_adha_start_date],
    ["fitr", "Eid ul Fitr", settings.eid_fitr_start_date],
  ] as const) {
    if (!startDate) continue;
    try {
      const offset = daysBetween(startDate, today);
      if (offset >= 0 && offset <= 2) return { kind, label, startDate, day: (offset + 1) as 1 | 2 | 3 };
    } catch { /* Ignore an invalid external date rather than show a false Eid greeting. */ }
  }
  return null;
}
