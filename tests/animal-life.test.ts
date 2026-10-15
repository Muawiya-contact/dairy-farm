import { expect, it } from "vitest";
import { animalAge, animalLifeEvents, matchesAnimalFilter, parseAnimalDates } from "../src/lib/animal-life";
import type { Animal, FarmData } from "../src/lib/farm-data";

const today = "2026-10-15";

it("keeps sold and dead animals out of active species and milk filters", () => {
  const cow = { life_status: "active", species: "cow", milking_status: "milking" } as const;
  const sold = { ...cow, life_status: "sold" } as const;
  const deadBuffalo = { life_status: "dead", species: "buffalo", milking_status: "dry" } as const;
  expect(matchesAnimalFilter(cow, "cow")).toBe(true);
  expect(matchesAnimalFilter(sold, "cow")).toBe(false);
  expect(matchesAnimalFilter(deadBuffalo, "buffalo")).toBe(false);
  expect(matchesAnimalFilter(sold, "milking")).toBe(false);
  expect(matchesAnimalFilter(sold, "sold")).toBe(true);
  expect(matchesAnimalFilter(deadBuffalo, "all")).toBe(true);
});

it("requires an arrival date, and derives a farm-born animal's arrival from its birth", () => {
  expect(parseAnimalDates({ source: "born", arrival: "", birth: "2024-02-29", estimatedYears: "", estimatedMonths: "", today }))
    .toEqual({ arrival_date: "2024-02-29", birth_date: "2024-02-29", estimated_age_months_at_arrival: null, purchase_date: null });
  expect(() => parseAnimalDates({ source: "purchased", arrival: "", birth: "", estimatedYears: "", estimatedMonths: "", today }))
    .toThrow(/aane ki tareekh/);
  expect(() => parseAnimalDates({ source: "born", arrival: "", birth: "2026-10-16", estimatedYears: "", estimatedMonths: "", today }))
    .toThrow(/sahi, aaj tak/);
});

it("keeps a clearly labelled estimated age when birth date is unknown", () => {
  const dates = parseAnimalDates({ source: "gift", arrival: "2024-10-15", birth: "", estimatedYears: "2", estimatedMonths: "6", today });
  expect(dates).toEqual({ arrival_date: "2024-10-15", birth_date: null, estimated_age_months_at_arrival: 30, purchase_date: null });
  expect(animalAge({ ...dates, life_status: "active", exit_date: null }, today)).toBe("Taqreeban 4 saal 6 maheene");
  expect(() => parseAnimalDates({ source: "gift", arrival: "2024-10-15", birth: "2022-04-15", estimatedYears: "2", estimatedMonths: "", today }))
    .toThrow(/aik chunein/);
  expect(() => parseAnimalDates({ source: "gift", arrival: "2024-10-15", birth: "", estimatedYears: "-1", estimatedMonths: "", today }))
    .toThrow(/0-50/);
  expect(() => parseAnimalDates({ source: "gift", arrival: "2024-10-15", birth: "", estimatedYears: "50", estimatedMonths: "1", today }))
    .toThrow(/50 saal/);
});

it("calculates exact age from dates and freezes departed animals at their exit date", () => {
  const animal = { birth_date: "2020-10-16", arrival_date: "2022-01-01", estimated_age_months_at_arrival: null, life_status: "active" as const, exit_date: null };
  expect(animalAge(animal, today)).toBe("5 saal 11 maheene");
  expect(animalAge({ ...animal, life_status: "dead", exit_date: "2024-10-17" }, today)).toBe("4 saal (ikhtitam par)");
  expect(animalAge({ ...animal, birth_date: null }, today)).toBe("Darj nahi");
});

it("orders the recorded farm journey, including an other-reason departure", () => {
  const animal = { id: "a1", source: "gift", birth_date: null, arrival_date: "2023-01-01", purchase_price: null,
    exit_date: "2026-01-01", life_status: "removed", exit_reason: "Doosre farm bheja", sale_price: null } as Animal;
  const data = { health: [{ id: "h1", animal_id: "a1", event_date: "2024-01-01", title: "Vaccine" }], inseminations: [], calvings: [] } as unknown as Pick<FarmData, "health" | "inseminations" | "calvings">;
  expect(animalLifeEvents(animal, data).map(({ title, date }) => `${date}:${title}`)).toEqual([
    "2026-01-01:Farm se nikla", "2024-01-01:Sehat", "2023-01-01:Farm mein aaya",
  ]);
});
