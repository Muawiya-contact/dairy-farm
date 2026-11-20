import type { Animal, AnimalCareTask, HealthEvent, Insemination } from "./farm-data";
import { addDays } from "./dates";
import { breedingDueDate } from "./breeding-register";

export function currentHealthFollowups(health: HealthEvent[]): HealthEvent[] {
  const latestByFollowup = new Map<string, HealthEvent>();
  for (const event of [...health].sort((a, b) => b.event_date.localeCompare(a.event_date))) {
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

export function sevenDayMilkAverage(rows: { date: string; litres: number }[], today: string): number {
  const from = addDays(today, -6);
  return rows.filter((row) => row.date >= from && row.date <= today)
    .reduce((total, row) => total + Number(row.litres || 0), 0) / 7;
}

export type DueTask = { date: string; label: string; overdue: boolean };

export function animalDueTasks(input: {
  today: string;
  health: HealthEvent[];
  cycle?: Pick<Insemination, "status" | "ultrasound_due" | "ultrasound_date" | "checkup_due" | "checkup_date" | "dry_off_due" | "dry_off_date" | "calving_due">
    & Partial<Pick<Insemination, "ultrasound_due_override" | "checkup_due_override" | "dry_off_due_override" | "calving_due_override">>;
  milking: boolean;
  careTasks?: Pick<AnimalCareTask, "title" | "due_date" | "completed_date">[];
}): DueTask[] {
  const tasks: DueTask[] = [];
  const addTask = (date: string | null | undefined, label: string) => {
    if (date) tasks.push({ date, label, overdue: date < input.today });
  };
  currentHealthFollowups(input.health).forEach((event) => addTask(event.next_due_date, `${event.title} · agla check-up`));
  const cycle = input.cycle;
  if (cycle && cycle.status === "pending" && !cycle.ultrasound_date) addTask(breedingDueDate(cycle, "ultrasound").date, "Ultrasound check");
  if (cycle && cycle.status === "pregnant") {
    if (!cycle.checkup_date) addTask(breedingDueDate(cycle, "checkup").date, "Hamal ka check-up");
    if (input.milking && !cycle.dry_off_date) addTask(breedingDueDate(cycle, "dry_off").date, "Doodh band karne ka check");
    addTask(breedingDueDate(cycle, "calving").date, "Mutawaqqa paidaish");
  }
  input.careTasks?.filter((task) => !task.completed_date).forEach((task) => addTask(task.due_date, task.title));
  return tasks.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
