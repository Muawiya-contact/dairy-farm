import { expect, it } from "vitest";
import { nextBreedingTask, parseCalving } from "../src/lib/breeding-register";
import type { Insemination } from "../src/lib/farm-data";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const base = { calving_date: "2026-10-15", outcome_0: "alive", sex_0: "female" };

it("allows an untagged live calf and leaves optional details empty", () => {
  expect(parseCalving(form(base), 1, "2026-01-01", "2026-10-15")).toEqual({
    date: "2026-10-15", offspring: [{ outcome: "alive", sex: "female", tag: null, name: null, birth_weight_kg: null, notes: null }], ease: null, notes: null,
  });
});

it("keeps twin outcomes separate and rejects duplicate tags", () => {
  const twins = { ...base, tag_0: "A", outcome_1: "stillborn", sex_1: "male", weight_1: "23.50" };
  expect(parseCalving(form(twins), 2, "2026-01-01", "2026-10-15").offspring[1])
    .toMatchObject({ outcome: "stillborn", sex: "male", tag: null, birth_weight_kg: "23.50" });
  expect(() => parseCalving(form({ ...twins, outcome_1: "alive", tag_1: "a" }), 2, "2026-01-01", "2026-10-15"))
    .toThrow(/tag alag/);
});

it("rejects missing live sex, negative weight, and dates outside the service window", () => {
  expect(() => parseCalving(form({ ...base, sex_0: "" }), 1, "2026-01-01", "2026-10-15")).toThrow(/jins/);
  expect(() => parseCalving(form({ ...base, weight_0: "-1" }), 1, "2026-01-01", "2026-10-15")).toThrow(/wazan/);
  expect(() => parseCalving(form({ ...base, calving_date: "2025-12-31" }), 1, "2026-01-01", "2026-10-15")).toThrow(/tareekh/);
  expect(() => parseCalving(form({ ...base, calving_date: "2026-10-16" }), 1, "2026-01-01", "2026-10-15")).toThrow(/tareekh/);
  expect(() => parseCalving(form({ ...base, calving_date: "2026-02-30" }), 1, "2026-01-01", "2026-10-15")).toThrow(/tareekh/);
});

it("shows the next due date without making a diagnosis", () => {
  const record = { status: "pending", ultrasound_due: "2026-02-01", checkup_due: "2026-03-01", dry_off_due: "2026-08-01", calving_due: "2026-10-01", ultrasound_result: null, checkup_result: null, dry_off_date: null } as Insemination;
  expect(nextBreedingTask(record)).toEqual({ label: "Ultrasound", date: "2026-02-01" });
  expect(nextBreedingTask({ ...record, ultrasound_result: "pregnant" })).toEqual({ label: "Checkup", date: "2026-03-01" });
  expect(nextBreedingTask({ ...record, status: "pregnant" })).toEqual({ label: "Khushk hone ki jaanch", date: "2026-08-01" });
  expect(nextBreedingTask({ ...record, status: "pregnant", dry_off_date: "2026-08-02" })).toEqual({ label: "Paidaish", date: "2026-10-01" });
  expect(nextBreedingTask({ ...record, status: "pregnant" }, "2026-10-15")).toEqual({ label: "Paidaish", date: "2026-10-01" });
  expect(nextBreedingTask({ ...record, status: "calved" })).toBeNull();
});
