export const SHIFTS = ["morning", "noon", "evening"] as const;
export type MilkShiftName = (typeof SHIFTS)[number];
export const SHIFT_LABELS: Record<MilkShiftName, string> = {
  morning: "Subah", noon: "Dopehr", evening: "Shaam",
};
export type MilkShiftConfig = { effective_from: string; noon_enabled: boolean };

/** No config before rollout means the farm used two shifts on those days. */
export function noonEnabledOn(date: string, rows: readonly MilkShiftConfig[]): boolean {
  return rows.filter((row) => row.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.noon_enabled ?? false;
}

export function expectedShifts(date: string, rows: readonly MilkShiftConfig[]): MilkShiftName[] {
  return SHIFTS.filter((shift) => shift !== "noon" || noonEnabledOn(date, rows));
}

export function visibleShifts(date: string, rows: readonly MilkShiftConfig[],
  entered: readonly { milk_date: string; shift: string }[]): MilkShiftName[] {
  const expected = expectedShifts(date, rows);
  return SHIFTS.filter((shift) => expected.includes(shift) ||
    entered.some((row) => row.milk_date === date && row.shift === shift));
}
