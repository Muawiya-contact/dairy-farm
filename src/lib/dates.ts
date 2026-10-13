const PK_ZONE = "Asia/Karachi";
const DAY_MS = 86_400_000;

function dayDate(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("Invalid farm date");
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date));
  if (value.toISOString().slice(0, 10) !== day) throw new RangeError("Invalid farm date");
  return value;
}

export function todayPK(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PK_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const monthStart = (day: string): string => `${dayDate(day).toISOString().slice(0, 7)}-01`;

export function addDays(day: string, count: number): string {
  if (!Number.isInteger(count)) throw new RangeError("Day offset must be an integer");
  return new Date(dayDate(day).getTime() + count * DAY_MS).toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string): number =>
  (dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS;

export const formatDay = (day: string): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(dayDate(day));

export const formatMonth = (day: string): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(dayDate(day));

const UR_DAYS = ["Itwaar", "Peer", "Mangal", "Budh", "Jumeraat", "Jumma", "Hafta"];
export const dayNameUr = (day: string): string => UR_DAYS[dayDate(day).getUTCDay()];
