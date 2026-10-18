import type { HerdAlert } from "./farm-data";

export function alertId(alert: HerdAlert): string {
  return `${alert.animal_id}:${alert.alert_kind}:${alert.due_date}:${alert.message}`;
}

export function sortedAlerts(alerts: readonly HerdAlert[]): HerdAlert[] {
  const rank = { overdue: 0, today: 1, soon: 2, upcoming: 3 };
  return [...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]
    || a.days_left - b.days_left || a.tag.localeCompare(b.tag));
}

export function bannerCounts(alerts: readonly HerdAlert[], dismissedIds: readonly string[]): { overdue: number; today: number; soon: number } | null {
  const urgent = alerts.filter((alert) => alert.severity !== "upcoming");
  if (!urgent.length || urgent.every((alert) => dismissedIds.includes(alertId(alert)))) return null;
  return {
    overdue: urgent.filter((alert) => alert.severity === "overdue").length,
    today: urgent.filter((alert) => alert.severity === "today").length,
    soon: urgent.filter((alert) => alert.severity === "soon").length,
  };
}

export function readDismissed(date: string, storage: Pick<Storage, "getItem">): string[] {
  try {
    const saved = JSON.parse(storage.getItem("farm-herd-reminders") ?? "null") as { date?: string; ids?: unknown } | null;
    return saved?.date === date && Array.isArray(saved.ids) ? saved.ids.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

export function writeDismissed(date: string, ids: string[], storage: Pick<Storage, "setItem">): void {
  try { storage.setItem("farm-herd-reminders", JSON.stringify({ date, ids })); }
  catch { /* Private browsing may disable storage; reminders remain visible. */ }
}
