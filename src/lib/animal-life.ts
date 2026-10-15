import { daysBetween } from "./dates";
import type { Animal, FarmData } from "./farm-data";

export type AnimalSource = "born" | "purchased" | "gift" | "transfer" | "other";
export type AnimalExit = "sold" | "dead" | "removed";

export function matchesAnimalFilter(animal: Pick<Animal, "life_status" | "species" | "milking_status">, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "active" || filter === "sold" || filter === "dead" || filter === "removed") return animal.life_status === filter;
  return animal.life_status === "active" && (animal.species === filter || animal.milking_status === filter);
}

const validDate = (value: string, today: string, label: string): string => {
  try {
    if (daysBetween(value, today) < 0) throw new RangeError();
  } catch { throw new RangeError(`${label} ki sahi, aaj tak ki tareekh chunein.`); }
  return value;
};

export function parseAnimalDates(input: {
  source: AnimalSource; arrival: string; birth: string;
  estimatedYears: string; estimatedMonths: string; purchaseDate?: string; today: string;
}): { arrival_date: string; birth_date: string | null; estimated_age_months_at_arrival: number | null; purchase_date: string | null } {
  const birth = input.birth.trim();
  const arrival = input.source === "born" ? birth : input.arrival.trim();
  if (input.source === "born" && !birth) throw new RangeError("Farm par paida janwar ki paidaish ki tareekh likhein.");
  if (!arrival) throw new RangeError("Farm mein aane ki tareekh likhein.");
  validDate(arrival, input.today, "Aane");
  if (birth) {
    validDate(birth, input.today, "Paidaish");
    if (daysBetween(birth, arrival) < 0) throw new RangeError("Paidaish farm mein aane ke baad nahi ho sakti.");
  }
  const years = input.estimatedYears.trim();
  const months = input.estimatedMonths.trim();
  const hasEstimate = years !== "" || months !== "";
  if (birth && hasEstimate) throw new RangeError("Paidaish ki tareekh ya taqreebi umar mein se aik chunein.");
  if (input.source === "born" && hasEstimate) throw new RangeError("Farm par paida janwar ki asli paidaish likhein.");
  const integer = (value: string, max: number) => {
    if (!/^\d+$/.test(value) || Number(value) > max) throw new RangeError("Taqreebi umar saal 0-50 aur maheene 0-11 mein likhein.");
    return Number(value);
  };
  const estimate = hasEstimate ? integer(years || "0", 50) * 12 + integer(months || "0", 11) : null;
  if (estimate != null && estimate > 600) throw new RangeError("Taqreebi umar 50 saal se zyada nahi ho sakti.");
  const purchase = input.source === "purchased" ? input.purchaseDate?.trim() || "" : "";
  if (purchase) {
    validDate(purchase, input.today, "Kharid");
    if (birth && daysBetween(birth, purchase) < 0) throw new RangeError("Kharid ki tareekh paidaish se pehle nahi ho sakti.");
  }
  return { arrival_date: arrival, birth_date: birth || null,
    estimated_age_months_at_arrival: estimate, purchase_date: purchase || null };
}

function completeMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + tm - fm - (td < fd ? 1 : 0));
}

export function animalAge(animal: Pick<Animal, "birth_date" | "arrival_date" | "estimated_age_months_at_arrival" | "life_status" | "exit_date">, today: string): string {
  const asOf = animal.life_status === "active" ? today : animal.exit_date ?? today;
  let months: number;
  let approximate = false;
  if (animal.birth_date) months = completeMonths(animal.birth_date, asOf);
  else if (animal.arrival_date && animal.estimated_age_months_at_arrival != null) {
    months = animal.estimated_age_months_at_arrival + completeMonths(animal.arrival_date, asOf);
    approximate = true;
  } else return "Darj nahi";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const age = years ? `${years} saal${remainder ? ` ${remainder} maheene` : ""}` : `${remainder} maheene`;
  return `${approximate ? "Taqreeban " : ""}${age}${animal.life_status === "active" ? "" : " (ikhtitam par)"}`;
}

export type AnimalLifeEvent = { id: string; date: string; title: string; detail: string };
export function animalLifeEvents(animal: Animal, data: Pick<FarmData, "health" | "inseminations" | "calvings">): AnimalLifeEvent[] {
  const events: AnimalLifeEvent[] = [];
  if (animal.birth_date) events.push({ id: "birth", date: animal.birth_date, title: "Paidaish", detail: animal.source === "born" ? "Farm par paida hua" : "Paidaish ki darj shuda tareekh" });
  if (animal.arrival_date && (animal.source !== "born" || !animal.birth_date)) {
    const source = { purchased: "Kharida", gift: "Tohfa", transfer: "Transfer", other: "Doosra zariya", born: "Farm par paida hua" }[animal.source] ?? "Farm mein aaya";
    events.push({ id: "arrival", date: animal.arrival_date, title: "Farm mein aaya", detail: `${source}${animal.purchase_price == null ? "" : ` · Rs ${Number(animal.purchase_price).toLocaleString("en-PK")}`}` });
  }
  for (const h of data.health.filter((row) => row.animal_id === animal.id))
    events.push({ id: `health:${h.id}`, date: h.event_date, title: "Sehat", detail: h.title });
  for (const i of data.inseminations.filter((row) => row.animal_id === animal.id))
    events.push({ id: `breeding:${i.id}`, date: i.service_date, title: "Nasl kashi", detail: i.semen_name || i.semen_type });
  for (const c of data.calvings.filter((row) => row.animal_id === animal.id))
    events.push({ id: `calving:${c.id}`, date: c.calving_date, title: "Bachay ki paidaish", detail: c.outcome });
  if (animal.exit_date) events.push({ id: "exit", date: animal.exit_date,
    title: animal.life_status === "sold" ? "Farokht" : animal.life_status === "dead" ? "Wafat" : "Farm se nikla",
    detail: [animal.exit_reason, animal.sale_price == null ? "" : `Rs ${Number(animal.sale_price).toLocaleString("en-PK")}`].filter(Boolean).join(" · ") });
  return events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
