import { describe, expect, it } from "vitest";
import { animalWeightChange, animalWeightChart, animalWeightHistory, parseAnimalWeight, type AnimalWeightRecord } from "@/lib/animal-weight-history";

const record = (id: string, weight_date: string, weight_kg: number, created_at = `${weight_date}T10:00:00Z`): AnimalWeightRecord => ({
  id, animal_id: "calf-1", weight_date, weight_kg, notes: null, created_at,
});

describe("calf weight history", () => {
  it("keeps the birth weight as the first measurement and sorts repeated entries by date and creation time", () => {
    const history = animalWeightHistory([
      record("later", "2026-11-02", 42),
      record("same-day-late", "2026-11-01", 38, "2026-11-01T12:00:00Z"),
      record("same-day-early", "2026-11-01", 36, "2026-11-01T08:00:00Z"),
    ], { date: "2026-11-01", weight_kg: 32.5 });

    expect(history.map((row) => [row.id, row.weight_kg])).toEqual([
      ["birth:2026-11-01", 32.5], ["same-day-early", 36], ["same-day-late", 38], ["later", 42],
    ]);
  });

  it("calculates latest, previous, and change from the last two saved readings", () => {
    expect(animalWeightChange(animalWeightHistory([
      record("first", "2026-11-01", 32.5), record("second", "2026-11-15", 38),
    ]))).toMatchObject({ latest: { id: "second", weight_kg: 38 }, previous: { id: "first", weight_kg: 32.5 }, change_kg: 5.5 });
    expect(animalWeightChange([])).toEqual({ latest: null, previous: null, change_kg: null });
  });

  it("builds a bounded chart for one, constant, and long histories", () => {
    expect(animalWeightChart([record("one", "2026-11-01", 30)])).toMatchObject([{ x: 320, y: 110 }]);
    expect(animalWeightChart([record("a", "2026-11-01", 30), record("b", "2026-11-02", 30)]).map(({ y }) => y)).toEqual([110, 110]);
    const long = Array.from({ length: 15 }, (_, index) => record(String(index), `2026-11-${String(index + 1).padStart(2, "0")}`, 30 + index));
    expect(animalWeightChart(long)).toHaveLength(12);
    expect(animalWeightChart(long)[0].id).toBe("3");
  });

  it("accepts precise positive weights and rejects empty, zero, negative, non-finite, or out-of-range values", () => {
    expect(parseAnimalWeight(" 32.50 ")).toBe(32.5);
    for (const value of ["", "0", "-1", "NaN", "Infinity", "10000"]) {
      expect(() => parseAnimalWeight(value)).toThrow(RangeError);
    }
  });
});
