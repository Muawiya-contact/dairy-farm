import { expect, test } from "vitest";
import { alertId, bannerCounts, readDismissed, sortedAlerts, writeDismissed } from "../../src/lib/reminders";
import type { HerdAlert } from "../../src/lib/farm-data";

const alerts = (["upcoming", "soon", "today", "overdue"] as const).map((severity, index): HerdAlert => ({
  animal_id: String(index), alert_kind: "ultrasound", due_date: "2026-10-18", tag: String(index),
  severity, days_left: [7, 2, 0, -2][index], message: "Reminder",
}));

test("bell list sorts overdue, today, soon, upcoming and counts all", () => {
  expect(sortedAlerts(alerts).map((alert) => alert.severity)).toEqual(["overdue", "today", "soon", "upcoming"]);
  expect(alerts).toHaveLength(4);
});

test("banner dismisses for this date, returns for a new day or a new alert", () => {
  const state = new Map<string, string>();
  const storage = { getItem: (key: string) => state.get(key) ?? null, setItem: (key: string, value: string) => { state.set(key, value); } };
  const date = "2026-10-18";
  expect(bannerCounts(alerts, [])).toEqual({ overdue: 1, today: 1, soon: 1 });
  const ids = alerts.filter((alert) => alert.severity !== "upcoming").map(alertId);
  writeDismissed(date, ids, storage);
  expect(bannerCounts(alerts, readDismissed(date, storage))).toBeNull();
  expect(readDismissed("2026-10-19", storage)).toEqual([]);
  expect(bannerCounts([...alerts, { ...alerts[0], animal_id: "new", severity: "today" }], readDismissed(date, storage))).not.toBeNull();
  expect(bannerCounts([alerts[0]], [])).toBeNull();
});

test("storage failure leaves the reminder visible", () => {
  const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  writeDismissed("2026-10-18", [alertId(alerts[1])], storage);
  expect(readDismissed("2026-10-18", storage)).toEqual([]);
  expect(bannerCounts(alerts, readDismissed("2026-10-18", storage))).not.toBeNull();
});
