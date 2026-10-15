import { addDays } from "./dates";

export type HijriDate = { year: number; month: number; day: number };
export type GyarhwinReminder = { phase: "prepare" | "today"; hijri: HijriDate; title: string; message: string };

export function gyarhwinDismissalKey(pakistanDay: string, phase: GyarhwinReminder["phase"], adjustmentDays: number): string {
  return `dairy-farm:gyarhwin:dismissed:${pakistanDay}:${phase}:${adjustmentDays}`;
}

// ICU's Islamic calendar is an estimate, not Pakistan's announced moon sighting.
// Noon UTC is 17:00 PKT, safely within the selected Pakistan civil date.
export function estimatedHijriDate(pakistanDay: string, adjustmentDays = 0): HijriDate | null {
  if (!Number.isInteger(adjustmentDays) || adjustmentDays < -2 || adjustmentDays > 2) {
    throw new RangeError("Hijri date adjustment must be between -2 and 2 days");
  }
  const adjustedDay = addDays(pakistanDay, adjustmentDays);
  try {
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-islamic-nu-latn", {
      timeZone: "Asia/Karachi", year: "numeric", month: "numeric", day: "numeric",
    });
    if (formatter.resolvedOptions().calendar !== "islamic") return null;
    const parts = formatter.formatToParts(new Date(`${adjustedDay}T12:00:00.000Z`));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = value("year"), month = value("month"), day = value("day");
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 30) return null;
    return { year, month, day };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function gyarhwinReminder(pakistanDay: string, enabled: boolean, adjustmentDays: number): GyarhwinReminder | null {
  if (!enabled) return null;
  const hijri = estimatedHijriDate(pakistanDay, adjustmentDays);
  if (!hijri || (hijri.day !== 10 && hijri.day !== 11)) return null;
  return hijri.day === 10
    ? {
      phase: "prepare", hijri, title: "Gyarhwin ki tayyari",
      message: "Maghrib ke baad 11win raat. Zaroorat ho to kal ka doodh plan karein.",
    }
    : {
      phase: "today", hijri, title: "Aaj Gyarhwin hai",
      message: "Khairaat ka diya hua doodh Muft customer ke naam darj karein.",
    };
}

export function nextGyarhwinDate(pakistanDay: string, adjustmentDays: number): string | null {
  for (let ahead = 0; ahead <= 31; ahead++) {
    const day = addDays(pakistanDay, ahead);
    const hijri = estimatedHijriDate(day, adjustmentDays);
    if (!hijri) return null;
    if (hijri.day === 11) return day;
  }
  return null;
}
