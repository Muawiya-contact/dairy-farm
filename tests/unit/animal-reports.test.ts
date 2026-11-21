import { describe, expect, it } from "vitest";
import { buildAnimalReport, type AnimalReportFilters } from "@/lib/animal-reports";
import type { Animal, Calving, CalvingOffspring, HealthEvent, Insemination } from "@/lib/farm-data";

const filters: AnimalReportFilters = { from: "2026-10-01", to: "2026-10-31", animalId: "", species: "all", search: "" };
const animal = (overrides: Partial<Animal> = {}): Animal => ({
  id: "cow-1", tag: "C-1", name: "Gauri", species: "cow", breed: "Sahiwal", sex: "female", category: "cow",
  birth_date: "2022-01-01", arrival_date: "2022-02-01", estimated_age_months_at_arrival: null, mother_id: null,
  purchase_date: null, purchase_price: null, seller_name: null, purchase_location: null, photo_path: null,
  source: "born", sire: null, milking_status: "milking", life_status: "active", exit_date: null,
  exit_reason: null, sale_price: null, notes: null, updated_at: "2026-10-01T00:00:00Z", ...overrides,
});

describe("Animal Reports", () => {
  it("keeps the full inventory, species views, and active dry status distinct", () => {
    const source = { animals: [animal(), animal({ id: "buffalo-1", tag: "B-1", name: "Rani", species: "buffalo", milking_status: "dry" }), animal({ id: "sold-1", tag: "C-2", life_status: "sold" })] };
    expect(buildAnimalReport("inventory", filters, source).sections[0].rows).toHaveLength(3);
    expect(buildAnimalReport("cows", filters, source).sections[0].rows.map((row) => row.tag)).toEqual(["C-1", "C-2"]);
    expect(buildAnimalReport("buffaloes", filters, source).sections[0].rows.map((row) => row.tag)).toEqual(["B-1"]);
    expect(buildAnimalReport("dry", filters, source).sections[0].rows.map((row) => row.tag)).toEqual(["B-1"]);
  });

  it("reconciles recorded animal purchase and sale amounts inside inclusive dates", () => {
    const source = { animals: [
      animal({ source: "purchased", purchase_date: "2026-10-01", purchase_price: 100.5, seller_name: "Ali" }),
      animal({ id: "sold-1", tag: "C-2", life_status: "sold", exit_date: "2026-10-31", sale_price: 500, exit_reason: "Sold" }),
      animal({ id: "old-1", tag: "C-3", source: "purchased", purchase_date: "2026-09-30", purchase_price: 30 }),
    ] };
    const report = buildAnimalReport("transactions", filters, source);
    expect(report.sections[0].rows.map((row) => row.transaction_kind)).toEqual(["Kharid", "Farokht"]);
    expect(report.summary.map((row) => row.value)).toEqual(["1", "Rs 100.5", "1", "Rs 500"]);
  });

  it("groups only saved per-animal milk rows into daily and monthly totals", () => {
    const source = {
      animals: [animal(), animal({ id: "buffalo-1", tag: "B-1", species: "buffalo" })],
      dailyMilk: [
        { report_date: "2026-10-01", animal_id: "cow-1", tag: "C-1", name: "Gauri", morning_litres: 1.25, noon_litres: 0, evening_litres: 0, total_litres: 1.25 },
        { report_date: "2026-10-02", animal_id: "cow-1", tag: "C-1", name: "Gauri", morning_litres: 0, noon_litres: 1.5, evening_litres: 0, total_litres: 1.5 },
        { report_date: "2026-10-02", animal_id: "buffalo-1", tag: "B-1", name: "", morning_litres: 2, noon_litres: 0, evening_litres: 0, total_litres: 2 },
      ],
    };
    const report = buildAnimalReport("milk", { ...filters, species: "cow" }, source);
    expect(report.sections[0].rows).toHaveLength(2);
    expect(report.sections[1].rows).toEqual([expect.objectContaining({ month: "2026-10", tag: "C-1", total_litres: 2.75 })]);
    expect(report.summary.find((row) => row.label === "Kul darj doodh")?.value).toBe("2.75 L");
  });

  it("ranks recorded yield without treating unassigned total milk as an animal's production", () => {
    const source = {
      animals: [animal(), animal({ id: "buffalo-1", tag: "B-1", species: "buffalo" })],
      milkSummary: [
        { animal_id: "cow-1", tag: "C-1", name: "Gauri", morning_litres: 3, noon_litres: 0, evening_litres: 0, total_litres: 3, recorded_days: 1, is_grand_total: false },
        { animal_id: "buffalo-1", tag: "B-1", name: "Rani", morning_litres: 1, noon_litres: 0, evening_litres: 0, total_litres: 1, recorded_days: 1, is_grand_total: false },
        { animal_id: null, tag: "—", name: "Grand Total", morning_litres: 4, noon_litres: 0, evening_litres: 0, total_litres: 4, recorded_days: 1, is_grand_total: true },
      ],
    };
    const report = buildAnimalReport("yield", { ...filters, species: "cow" }, source);
    expect(report.sections[0].rows.map((row) => row.tag)).toEqual(["C-1"]);
    expect(report.summary.find((row) => row.label === "Sab se zyada")?.value).toBe("C-1 · 3 L");
  });

  it("filters health, pregnancy, and calving reports to saved eligible events", () => {
    const mother = animal();
    const health = { id: "h1", animal_id: mother.id, event_date: "2026-10-16", kind: "vaccine", title: "FMD", medicine: "Dose", vet: "Vet", cost: 20, next_due_date: "2027-01-01", notes: null } as HealthEvent;
    const pregnant = { id: "i1", animal_id: mother.id, status: "pregnant", service_date: "2026-09-01", calving_due: "2027-06-01", calving_due_override: "2027-06-10", checkup_due: "2026-11-01", checkup_due_override: null, ultrasound_due: "2026-10-01", dry_off_due: "2027-03-01", ultrasound_date: null, checkup_date: null, dry_off_date: null, abortion_date: null, semen_type: "ai", semen_name: "Bull 1", semen_batch: null, technician: null, notes: null } as Insemination;
    const calving = { id: "c1", animal_id: mother.id, calf_id: "calf-1", calving_date: "2026-10-17", outcome: "normal", ease_score: 2, notes: null } as Calving;
    const offspring = { id: "o1", calving_id: calving.id, birth_order: 1, animal_id: "calf-1", outcome: "alive", sex: "female", tag_at_birth: "K-1", birth_weight_kg: 30, notes: null } as CalvingOffspring;
    const source = {
      animals: [mother, animal({ id: "sold-1", tag: "C-2", life_status: "sold" }), animal({ id: "calf-1", tag: "K-1", category: "calf" })],
      health: [health], healthDetails: [{ health_event_id: health.id, symptoms: "Fever", diagnosis: "Vet note", dosage: "2 ml" }],
      inseminations: [pregnant], calvings: [calving], offspring: [offspring],
    };
    expect(buildAnimalReport("health", filters, source).sections[0].rows[0]).toMatchObject({ tag: "C-1", kind: "Teeka", cost: 20, symptoms: "Fever", diagnosis: "Vet note", dosage: "2 ml" });
    expect(buildAnimalReport("pregnant", filters, source).sections[0].rows).toEqual([expect.objectContaining({ tag: "C-1", calving_due: "2027-06-10", calving_due_source: "Khud set" })]);
    const calvings = buildAnimalReport("calvings", { ...filters, to: "2026-10-31" }, source);
    expect(calvings.sections[0].rows).toEqual([expect.objectContaining({ mother_tag: "C-1", calf_tag: "K-1", birth_weight_kg: 30 })]);
    expect(calvings.summary.find((row) => row.label === "Calving records")?.value).toBe("1");
  });
});
