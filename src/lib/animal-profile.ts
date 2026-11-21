import type { Animal, HealthEvent } from "./farm-data";
import { addDays } from "./dates";
import { sumMilkLitres } from "./milk-entry";

export function currentHealthFollowups(health: HealthEvent[]): HealthEvent[] {
  const latestByFollowup = new Map<string, HealthEvent>();
  for (const event of [...health].sort((a, b) =>
    b.event_date.localeCompare(a.event_date)
    || b.created_at.localeCompare(a.created_at)
    || b.id.localeCompare(a.id))) {
    const key = `${event.kind}:${event.title.trim().toLocaleLowerCase()}`;
    if (!latestByFollowup.has(key)) latestByFollowup.set(key, event);
  }
  return [...latestByFollowup.values()].filter((event) => event.next_due_date);
}

export type AnimalProfileStatuses = {
  life: Animal["life_status"];
  production: Animal["milking_status"];
  breeding: string;
  health: "overdue" | "scheduled" | "no-follow-up" | "no-record";
  healthDueDate: string | null;
};

export function animalProfileStatuses(animal: Animal, breedingStatus: string | null | undefined, health: HealthEvent[], today: string): AnimalProfileStatuses {
  const nextDue = currentHealthFollowups(health).map((event) => event.next_due_date!).sort()[0] ?? null;
  const hasHealth = health.length > 0;
  return {
    life: animal.life_status,
    production: animal.milking_status,
    breeding: breedingStatus ?? (animal.sex === "male" || animal.category === "calf" ? "na" : "unknown"),
    health: !hasHealth ? "no-record" : !nextDue ? "no-follow-up" : nextDue < today ? "overdue" : "scheduled",
    healthDueDate: nextDue,
  };
}

export function sevenDayMilkAverage(
  rows: { date: string; litres: number }[],
  today: string,
  shifts: { milk_date: string; mode: "total" | "per_animal" }[] = [],
): number | null {
  const from = addDays(today, -6);
  if (shifts.some((shift) => shift.mode === "total" && shift.milk_date >= from && shift.milk_date <= today)) return null;
  return sumMilkLitres(rows.filter((row) => row.date >= from && row.date <= today).map((row) => Number(row.litres) || 0)) / 7;
}

export type DueTask = { date: string; label: string; overdue: boolean };

export function animalDueTasks(input: {
  today: string;
  health: HealthEvent[];
  cycle?: { status: string; ultrasound_due: string; ultrasound_date: string | null; checkup_due: string; checkup_date: string | null; dry_off_due: string; dry_off_date: string | null; calving_due: string };
  milking: boolean;
}): DueTask[] {
  const tasks: DueTask[] = [];
  const addTask = (date: string | null | undefined, label: string) => {
    if (date) tasks.push({ date, label, overdue: date < input.today });
  };
  currentHealthFollowups(input.health).forEach((event) => addTask(event.next_due_date, `${event.title} · agla check-up`));
  const cycle = input.cycle;
  if (cycle && cycle.status === "pending" && !cycle.ultrasound_date) addTask(cycle.ultrasound_due, "Ultrasound check");
  if (cycle && cycle.status === "pregnant") {
    if (!cycle.checkup_date) addTask(cycle.checkup_due, "Hamal ka check-up");
    if (input.milking && !cycle.dry_off_date) addTask(cycle.dry_off_due, "Doodh band karne ka check");
    addTask(cycle.calving_due, "Mutawaqqa paidaish");
  }
  return tasks.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
