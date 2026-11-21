import { describe, expect, it } from "vitest";
import { animalDueTasks, animalProfileStatuses, latestHealthEvent, sevenDayMilkAverage } from "@/lib/animal-profile";
import { ANIMAL_PHOTO_MAX_BYTES, validateAnimalPhoto } from "@/lib/animal-photos";
import type { Animal, HealthEvent } from "@/lib/farm-data";

const animal = {
  id: "animal-1", tag: "A-1", name: null, species: "cow", breed: null, sex: "female", category: "cow",
  birth_date: null, arrival_date: null, estimated_age_months_at_arrival: null, mother_id: null, purchase_date: null,
  purchase_price: null, seller_name: null, purchase_location: null, photo_path: null, source: "purchased", sire: null,
  milking_status: "milking", life_status: "active", exit_date: null, exit_reason: null, sale_price: null, notes: null, updated_at: "v1",
} as Animal;
const health = (value: Partial<HealthEvent>): HealthEvent => ({
  id: "health-1", animal_id: animal.id, event_date: "2026-11-20", kind: "treatment", title: "Hoof care",
  medicine: null, vet: null, notes: null, cost: 0, next_due_date: null, expense_id: null, ...value,
  created_at: value.created_at ?? "2026-11-20T00:00:00Z",
});

describe("animal profile overview", () => {
  it("uses creation time and ID to select the latest same-day health event", () => {
    const events = [
      health({ id: "older", event_date: "2026-11-20", created_at: "2026-11-20T10:00:00Z", title: "Older entry" }),
      health({ id: "newer", event_date: "2026-11-20", created_at: "2026-11-20T11:00:00Z", title: "Newer entry" }),
    ];
    expect(latestHealthEvent(events)?.title).toBe("Newer entry");
    expect(latestHealthEvent([...events].reverse())?.title).toBe("Newer entry");
    expect(latestHealthEvent([
      ...events,
      health({ id: "z-latest-id", event_date: "2026-11-20", created_at: "2026-11-20T11:00:00Z", title: "Latest ID" }),
    ])?.title).toBe("Latest ID");
  });

  it("keeps life, production, breeding, and health dimensions independent", () => {
    const status = animalProfileStatuses(animal, "pregnant", [health({ next_due_date: "2026-11-20" })], "2026-11-21");
    expect(status).toEqual({ life: "active", production: "milking", breeding: "pregnant", health: "overdue", healthDueDate: "2026-11-20" });
  });

  it("uses the latest matching health event so a completed follow-up stops appearing overdue", () => {
    const status = animalProfileStatuses(animal, "open", [
      health({ id: "old", event_date: "2026-11-01", next_due_date: "2026-11-10" }),
      health({ id: "done", event_date: "2026-11-12", next_due_date: null }),
    ], "2026-11-21");
    expect(status.health).toBe("no-follow-up");
    expect(status.healthDueDate).toBeNull();
  });

  it("uses creation time and ID to resolve same-day health follow-ups", () => {
    const sameCreationTime = [
      health({ id: "event-a", event_date: "2026-11-20", created_at: "2026-11-20T10:00:00Z", next_due_date: "2026-11-25" }),
      health({ id: "event-b", event_date: "2026-11-20", created_at: "2026-11-20T10:00:00Z", next_due_date: null }),
    ];
    const laterCreationTime = [
      health({ id: "newer", event_date: "2026-11-20", created_at: "2026-11-20T11:00:00Z", next_due_date: null }),
      health({ id: "older", event_date: "2026-11-20", created_at: "2026-11-20T10:00:00Z", next_due_date: "2026-11-25" }),
    ];

    expect(animalProfileStatuses(animal, "open", sameCreationTime, "2026-11-21").health).toBe("no-follow-up");
    expect(animalProfileStatuses(animal, "open", laterCreationTime, "2026-11-21").health).toBe("no-follow-up");
  });

  it("averages only the seven calendar days through the farm date", () => {
    expect(sevenDayMilkAverage([
      { date: "2026-11-14", litres: 50 }, { date: "2026-11-15", litres: 14 }, { date: "2026-11-21", litres: 7 },
      { date: "2026-11-22", litres: 100 },
    ], "2026-11-21")).toBe(3);
  });

  it("uses cent-based totals and omits an average when a recent shift has no animal attribution", () => {
    const rows = [
      { date: "2026-11-20", litres: 0.1 },
      { date: "2026-11-20", litres: 0.2 },
    ];
    expect(sevenDayMilkAverage(rows, "2026-11-21", [
      { milk_date: "2026-11-20", mode: "per_animal" },
    ])).toBeCloseTo(0.3 / 7, 10);
    expect(sevenDayMilkAverage(rows, "2026-11-21", [
      { milk_date: "2026-11-20", mode: "total" },
    ])).toBeNull();
  });

  it("leaves milk average unrecorded without shifts but preserves a recorded zero", () => {
    expect(sevenDayMilkAverage([], "2026-11-21", [])).toBeNull();
    expect(sevenDayMilkAverage([{ date: "2026-11-21", litres: 0 }], "2026-11-21", [
      { milk_date: "2026-11-21", mode: "per_animal" },
    ])).toBe(0);
  });

  it("lists only incomplete breeding tasks and the current health follow-ups", () => {
    const tasks = animalDueTasks({
      today: "2026-11-21", health: [health({ next_due_date: "2026-11-25" })], milking: true,
      cycle: { status: "pregnant", ultrasound_due: "2026-10-01", ultrasound_date: "2026-10-01", checkup_due: "2026-11-20", checkup_date: null,
        dry_off_due: "2026-11-22", dry_off_date: null, calving_due: "2027-01-01" },
    });
    expect(tasks.map((task) => [task.label, task.overdue])).toEqual([
      ["Hamal ka check-up", true], ["Doodh band karne ka check", false], ["Hoof care · agla check-up", false], ["Mutawaqqa paidaish", false],
    ]);
  });
});

describe("animal photo upload validation", () => {
  it("accepts supported photos within the storage limit", () => {
    expect(validateAnimalPhoto({ type: "image/jpeg", size: ANIMAL_PHOTO_MAX_BYTES } as File)).toBeNull();
    expect(validateAnimalPhoto({ type: "image/png", size: 12 } as File)).toBeNull();
  });

  it("rejects unsupported content types and empty or oversized files", () => {
    expect(validateAnimalPhoto({ type: "image/svg+xml", size: 100 } as File)).toMatch(/JPEG ya PNG/);
    expect(validateAnimalPhoto({ type: "image/jpeg", size: 0 } as File)).toMatch(/5 MB/);
    expect(validateAnimalPhoto({ type: "image/png", size: ANIMAL_PHOTO_MAX_BYTES + 1 } as File)).toMatch(/5 MB/);
  });
});
