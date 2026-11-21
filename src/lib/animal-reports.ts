import { allRows, type Animal, type Calving, type CalvingOffspring, type HealthEvent, type Insemination } from "./farm-data";
import { breedingDueDate } from "./breeding-register";
import { loadMilkReportAnimalSummary, loadMilkReportAnimals } from "./reporting";
import { rs } from "./format";

export type AnimalReportType = "inventory" | "cows" | "buffaloes" | "transactions" | "milk" | "yield" | "health" | "pregnant" | "calvings" | "dry";
export type AnimalReportFilters = { from: string; to: string; animalId: string; species: "all" | "cow" | "buffalo"; search: string };
export type AnimalReportSection = { title: string; columns: string[]; rows: Record<string, unknown>[] };
export type AnimalReportData = { summary: { label: string; value: string }[]; sections: AnimalReportSection[] };

export const ANIMAL_REPORTS: { id: AnimalReportType; title: string; description: string }[] = [
  { id: "inventory", title: "Tamam janwar", description: "Zinda aur tareekhi janwaron ki fehrist." },
  { id: "cows", title: "Gaye ki report", description: "Tamam gaye aur un ka mojooda record." },
  { id: "buffaloes", title: "Bhains ki report", description: "Tamam bhains aur un ka mojooda record." },
  { id: "transactions", title: "Kharid aur farokht", description: "Janwaron ki darj kharid aur farokht." },
  { id: "milk", title: "Rozana aur maahana doodh", description: "Janwar ke mutabiq rozana aur maheenay ka doodh." },
  { id: "yield", title: "Zyada aur kam doodh", description: "Chuni hui muddat ke saved doodh records ki ranking." },
  { id: "health", title: "Sehat, teekay aur ilaj", description: "Janwaron ke darj vet aur sehat ke waqiat." },
  { id: "pregnant", title: "Gaabhan janwar", description: "Active gaabhan janwar aur un ki mutawaqqa tareekhein." },
  { id: "calvings", title: "Bachay paida hone ka record", description: "Maa, tareekh aur har darj bachay ki tafseel." },
  { id: "dry", title: "Khushk janwar", description: "Woh active janwar jin ka doodh status khushk darj hai." },
];

type AnimalMilkRow = { report_date: string; animal_id: string; tag: string; name: string; morning_litres: number; noon_litres: number; evening_litres: number; total_litres: number };
type AnimalYieldRow = { animal_id: string | null; tag: string; name: string; morning_litres: number; noon_litres: number; evening_litres: number; total_litres: number; recorded_days: number; is_grand_total: boolean };
type ReportSource = {
  animals: Animal[];
  health?: HealthEvent[];
  healthDetails?: ({ health_event_id: string } & Partial<Pick<HealthEvent, "symptoms" | "diagnosis" | "severity" | "current_condition" | "medicine_type" | "dosage" | "route" | "treatment_start_date" | "treatment_end_date">>)[];
  inseminations?: Insemination[];
  calvings?: Calving[];
  offspring?: CalvingOffspring[];
  dailyMilk?: AnimalMilkRow[];
  milkSummary?: AnimalYieldRow[];
};

const LIFE_LABEL: Record<Animal["life_status"], string> = { active: "Chalu", sold: "Farokht", dead: "Wafat", removed: "Farm se nikla" };
const MILK_LABEL: Record<Animal["milking_status"], string> = { milking: "Doodh de rahi", dry: "Khushk", none: "Doodh nahi" };
const SPECIES_LABEL: Record<Animal["species"], string> = { cow: "Gaye", buffalo: "Bhains" };
const SEX_LABEL: Record<Animal["sex"], string> = { female: "Mada", male: "Nar" };
const CATEGORY_LABEL: Record<Animal["category"], string> = { cow: "Gaye", heifer: "Bachhi", calf: "Bacha", bull: "Saand" };
const HEALTH_LABEL: Record<string, string> = { vaccine: "Teeka", treatment: "Ilaj", deworming: "Deworming", checkup: "Vet check-up", other: "Doosra" };
const OUTCOME_LABEL: Record<string, string> = { alive: "Zinda", stillborn: "Paidaish par wafat", dead: "Wafat", twins: "Joray", normal: "Mamool ke mutabiq" };

const inDateRange = (date: string | null | undefined, filters: AnimalReportFilters) =>
  !!date && date >= filters.from && date <= filters.to;

function effectiveSpecies(type: AnimalReportType, selected: AnimalReportFilters["species"]): AnimalReportFilters["species"] {
  if (type === "cows") return "cow";
  if (type === "buffaloes") return "buffalo";
  return selected;
}

function filteredAnimals(animals: Animal[], filters: AnimalReportFilters, type: AnimalReportType): Animal[] {
  const species = effectiveSpecies(type, filters.species);
  return animals.filter((animal) => (!filters.animalId || animal.id === filters.animalId)
    && (species === "all" || animal.species === species));
}

function applySearch(sections: AnimalReportSection[], search: string): AnimalReportSection[] {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) return sections;
  return sections.map((section) => ({ ...section, rows: section.rows.filter((row) =>
    section.columns.some((column) => String(row[column] ?? "").toLocaleLowerCase().includes(normalized))) }));
}

const count = (label: string, value: number) => ({ label, value: String(value) });
const sumPaise = (values: unknown[]) =>
  values.reduce<number>((total, value) => total + Math.round(Number(value || 0) * 100), 0) / 100;
const sumLitres = (values: number[]) => Math.round(values.reduce((total, value) => total + Number(value || 0), 0) * 100) / 100;
const section = (title: string, columns: string[], rows: Record<string, unknown>[]): AnimalReportSection => ({ title, columns, rows });

export function buildAnimalReport(type: AnimalReportType, filters: AnimalReportFilters, source: ReportSource): AnimalReportData {
  const animals = filteredAnimals(source.animals, filters, type);
  const animalById = new Map(source.animals.map((animal) => [animal.id, animal]));
  let sections: AnimalReportSection[] = [];
  let summary: { label: string; value: string }[] = [];

  if (type === "inventory" || type === "cows" || type === "buffaloes" || type === "dry") {
    const rows = (type === "dry" ? animals.filter((animal) => animal.life_status === "active" && animal.milking_status === "dry") : animals)
      .map((animal) => ({
        tag: animal.tag, name: animal.name || "", species: SPECIES_LABEL[animal.species], breed: animal.breed || "",
        sex: SEX_LABEL[animal.sex], category: CATEGORY_LABEL[animal.category], life_status: LIFE_LABEL[animal.life_status],
        milking_status: MILK_LABEL[animal.milking_status], arrival_date: animal.arrival_date || "",
        birth_date: animal.birth_date || "", purchase_date: animal.purchase_date || "",
      }));
    sections = [section(type === "dry" ? "Khushk janwar" : "Janwaron ki fehrist",
      ["tag", "name", "species", "breed", "sex", "category", "life_status", "milking_status", "arrival_date", "birth_date", "purchase_date"], rows)];
    summary = [count(type === "dry" ? "Khushk active janwar" : "Janwar", rows.length)];
  }

  if (type === "transactions") {
    const rows = animals.flatMap((animal) => {
      const events: Record<string, unknown>[] = [];
      if (animal.source === "purchased" || animal.purchase_date || animal.purchase_price != null) {
        if (!filters.from || inDateRange(animal.purchase_date, filters)) events.push({
          transaction_date: animal.purchase_date || "", transaction_kind: "Kharid", tag: animal.tag,
          animal_name: animal.name || "", species: SPECIES_LABEL[animal.species], amount: animal.purchase_price,
          counterparty: animal.seller_name || animal.purchase_location || "", transaction_reason: "",
        });
      }
      if (animal.life_status === "sold" && (!filters.from || inDateRange(animal.exit_date, filters))) events.push({
        transaction_date: animal.exit_date || "", transaction_kind: "Farokht", tag: animal.tag,
        animal_name: animal.name || "", species: SPECIES_LABEL[animal.species], amount: animal.sale_price,
        counterparty: "", transaction_reason: animal.exit_reason || "",
      });
      return events;
    }).sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)) || String(a.tag).localeCompare(String(b.tag)));
    const visible = applySearch([section("Janwar ki kharid aur farokht", ["transaction_date", "transaction_kind", "tag", "animal_name", "species", "amount", "counterparty", "transaction_reason"], rows)], filters.search)[0].rows;
    const purchases = visible.filter((row) => row.transaction_kind === "Kharid");
    const sales = visible.filter((row) => row.transaction_kind === "Farokht");
    sections = [section("Janwar ki kharid aur farokht", ["transaction_date", "transaction_kind", "tag", "animal_name", "species", "amount", "counterparty", "transaction_reason"], visible)];
    summary = [count("Kharid ki entries", purchases.length), { label: "Kharid ki kul qeemat", value: rs(sumPaise(purchases.map((row) => row.amount))) },
      count("Farokht ki entries", sales.length), { label: "Farokht ki kul qeemat", value: rs(sumPaise(sales.map((row) => row.amount))) }];
  }

  if (type === "milk") {
    const milkById = new Map(source.animals.map((animal) => [animal.id, animal]));
    const daily = (source.dailyMilk ?? []).filter((row) => {
      const animal = milkById.get(row.animal_id);
      const species = effectiveSpecies(type, filters.species);
      return (!filters.animalId || filters.animalId === row.animal_id) && !!animal && (species === "all" || animal.species === species);
    });
    const monthlyMap = new Map<string, Record<string, unknown>>();
    for (const row of daily) {
      const month = row.report_date.slice(0, 7);
      const key = `${row.animal_id}:${month}`;
      const saved = monthlyMap.get(key) ?? { month, tag: row.tag, name: row.name, morning_litres: 0, noon_litres: 0, evening_litres: 0, total_litres: 0 };
      for (const column of ["morning_litres", "noon_litres", "evening_litres", "total_litres"] as const) {
        saved[column] = sumLitres([Number(saved[column]), Number(row[column] || 0)]);
      }
      monthlyMap.set(key, saved);
    }
    const monthly = [...monthlyMap.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.tag).localeCompare(String(b.tag)));
    sections = [
      section("Rozana janwar-wise doodh", ["report_date", "tag", "name", "morning_litres", "noon_litres", "evening_litres", "total_litres"], daily),
      section("Maahana janwar-wise doodh", ["month", "tag", "name", "morning_litres", "noon_litres", "evening_litres", "total_litres"], monthly),
    ];
    const visible = applySearch(sections, filters.search);
    const visibleDaily = visible[0].rows;
    summary = [count("Doodh record wali entries", visibleDaily.length),
      { label: "Kul darj doodh", value: `${sumLitres(visibleDaily.map((row) => Number(row.total_litres || 0))).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L` },
      count("Doodh record walay janwar", new Set(visibleDaily.map((row) => row.animal_id)).size)];
    sections = visible;
  }

  if (type === "yield") {
    const species = effectiveSpecies(type, filters.species);
    const rows = (source.milkSummary ?? []).filter((row) => !row.is_grand_total && !!row.animal_id
      && (!filters.animalId || filters.animalId === row.animal_id)
      && (species === "all" || animalById.get(row.animal_id!)?.species === species))
      .sort((a, b) => b.total_litres - a.total_litres || a.tag.localeCompare(b.tag))
      .map((row, index) => ({ rank: index + 1, tag: row.tag, name: row.name, morning_litres: row.morning_litres,
        noon_litres: row.noon_litres, evening_litres: row.evening_litres, total_litres: row.total_litres, recorded_days: row.recorded_days }));
    sections = [section("Doodh ki paidawar ki ranking", ["rank", "tag", "name", "morning_litres", "noon_litres", "evening_litres", "total_litres", "recorded_days"], rows)];
    const visible = applySearch(sections, filters.search)[0].rows;
    sections = [section("Doodh ki paidawar ki ranking", sections[0].columns, visible)];
    summary = [count("Muqable mein janwar", visible.length),
      { label: "Sab se zyada", value: visible.length ? `${visible[0].tag} · ${visible[0].total_litres} L` : "Koi saved per-animal record nahi" },
      { label: "Sab se kam (record walay janwar)", value: visible.length ? `${visible.at(-1)!.tag} · ${visible.at(-1)!.total_litres} L` : "Koi saved per-animal record nahi" }];
  }

  if (type === "health") {
    const detailsByEvent = new Map((source.healthDetails ?? []).map((details) => [details.health_event_id, details]));
    const events = (source.health ?? []).filter((event) => inDateRange(event.event_date, filters))
      .filter((event) => animals.some((animal) => animal.id === event.animal_id))
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
      .map((event) => {
        const animal = animalById.get(event.animal_id);
        const details = detailsByEvent.get(event.id);
        return { event_date: event.event_date, tag: animal?.tag || "", animal_name: animal?.name || "", species: animal ? SPECIES_LABEL[animal.species] : "",
          kind: HEALTH_LABEL[event.kind] ?? event.kind, title: event.title, medicine: event.medicine || "", vet: event.vet || "",
          symptoms: details?.symptoms || "", diagnosis: details?.diagnosis || "", severity: details?.severity || "",
          current_condition: details?.current_condition || "", medicine_type: details?.medicine_type || "", dosage: details?.dosage || "",
          route: details?.route || "", treatment_start_date: details?.treatment_start_date || "", treatment_end_date: details?.treatment_end_date || "",
          next_due_date: event.next_due_date || "", cost: Number(event.cost || 0), notes: event.notes || "" };
      });
    sections = [section("Sehat, teekay aur ilaj", ["event_date", "tag", "animal_name", "species", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "vet", "next_due_date", "cost", "notes"], events)];
    const visible = applySearch(sections, filters.search)[0].rows;
    sections = [section("Sehat, teekay aur ilaj", sections[0].columns, visible)];
    summary = [count("Sehat ke waqiat", visible.length),
      { label: "Darj sehat ka kul kharcha", value: rs(sumPaise(visible.map((row) => row.cost))) }];
  }

  if (type === "pregnant") {
    const activeIds = new Set(animals.filter((animal) => animal.life_status === "active" && animal.sex === "female").map((animal) => animal.id));
    const rows = (source.inseminations ?? []).filter((record) => record.status === "pregnant" && activeIds.has(record.animal_id))
      .sort((a, b) => a.service_date.localeCompare(b.service_date))
      .map((record) => {
        const animal = animalById.get(record.animal_id)!;
        const calving = breedingDueDate(record, "calving");
        const checkup = breedingDueDate(record, "checkup");
        return { tag: animal.tag, animal_name: animal.name || "", species: SPECIES_LABEL[animal.species], service_date: record.service_date,
          semen_name: record.semen_name || "", calving_due: calving.date, calving_due_source: calving.overridden ? "Khud set" : "Hisab se",
          checkup_due: checkup.date, milking_status: MILK_LABEL[animal.milking_status] };
      });
    sections = [section("Gaabhan janwar", ["tag", "animal_name", "species", "service_date", "semen_name", "calving_due", "calving_due_source", "checkup_due", "milking_status"], rows)];
    const visible = applySearch(sections, filters.search)[0].rows;
    sections = [section("Gaabhan janwar", sections[0].columns, visible)];
    summary = [count("Active gaabhan janwar", visible.length)];
  }

  if (type === "calvings") {
    const includedAnimalIds = new Set(animals.map((animal) => animal.id));
    const rows: Record<string, unknown>[] = (source.calvings ?? []).filter((calving) => inDateRange(calving.calving_date, filters))
      .filter((calving) => includedAnimalIds.has(calving.animal_id)
        || (source.offspring ?? []).some((child) => child.calving_id === calving.id && !!child.animal_id && includedAnimalIds.has(child.animal_id)))
      .flatMap((calving): Record<string, unknown>[] => {
        const mother = animalById.get(calving.animal_id);
        const children = (source.offspring ?? []).filter((child) => child.calving_id === calving.id);
        const base = { calving_date: calving.calving_date, mother_tag: mother?.tag || "", mother_name: mother?.name || "",
          species: mother ? SPECIES_LABEL[mother.species] : "", calving_outcome: OUTCOME_LABEL[calving.outcome] ?? calving.outcome,
          ease_score: calving.ease_score, notes: calving.notes || "" };
        if (!children.length) {
          const calf = calving.calf_id ? animalById.get(calving.calf_id) : undefined;
          return [{ ...base, calving_id: calving.id, birth_order: "", calf_tag: calf?.tag || "", calf_sex: calf ? SEX_LABEL[calf.sex] : "",
            calf_outcome: "Darj nahi", birth_weight_kg: null, calf_notes: "" }];
        }
        return children.map((child) => {
          const calf = child.animal_id ? animalById.get(child.animal_id) : undefined;
          return { ...base, calving_id: calving.id, birth_order: child.birth_order, calf_tag: calf?.tag || child.tag_at_birth || "", calf_sex: child.sex ? SEX_LABEL[child.sex as Animal["sex"]] ?? child.sex : "",
            calf_outcome: OUTCOME_LABEL[child.outcome] ?? child.outcome, birth_weight_kg: child.birth_weight_kg, calf_notes: child.notes || "" };
        });
      }).sort((a, b) => String(a.calving_date).localeCompare(String(b.calving_date)) || String(a.mother_tag).localeCompare(String(b.mother_tag)));
    sections = [section("Bachay paida hone ka record", ["calving_date", "mother_tag", "mother_name", "species", "calving_outcome", "birth_order", "calf_tag", "calf_sex", "calf_outcome", "birth_weight_kg", "ease_score", "notes", "calf_notes"], rows)];
    const visible = applySearch(sections, filters.search)[0].rows;
    sections = [section("Bachay paida hone ka record", sections[0].columns, visible)];
    summary = [count("Calving records", new Set(visible.map((row) => row.calving_id)).size), count("Bachon ke records", visible.length)];
  }

  if (type !== "transactions" && type !== "milk" && type !== "yield" && type !== "health" && type !== "pregnant" && type !== "calvings") {
    sections = applySearch(sections, filters.search);
    summary = [count(type === "dry" ? "Khushk active janwar" : "Janwar", sections[0]?.rows.length ?? 0)];
  }

  return { summary, sections };
}

export async function loadAnimalReport(type: AnimalReportType, filters: AnimalReportFilters, animals: Animal[]): Promise<AnimalReportData> {
  let source: ReportSource = { animals };
  if (type === "transactions") {
    source = { animals };
  } else if (type === "milk" || type === "yield") {
    const [dailyMilk, milkSummary] = await Promise.all([
      type === "milk" ? loadMilkReportAnimals(filters.from, filters.to, filters.animalId || null) : Promise.resolve([] as AnimalMilkRow[]),
      type === "yield" ? loadMilkReportAnimalSummary(filters.from, filters.to, filters.animalId || null) : Promise.resolve([] as AnimalYieldRow[]),
    ]);
    source = { animals, dailyMilk, milkSummary };
  } else if (type === "health") {
    const [health, healthDetails] = await Promise.all([
      allRows<HealthEvent>("health_events", "event_date"),
      allRows<({ health_event_id: string } & Partial<Pick<HealthEvent, "symptoms" | "diagnosis" | "severity" | "current_condition" | "medicine_type" | "dosage" | "route" | "treatment_start_date" | "treatment_end_date">>)>("health_event_details", "health_event_id"),
    ]);
    source = { animals, health, healthDetails };
  } else if (type === "pregnant") {
    source = { animals, inseminations: await allRows<Insemination>("inseminations", "service_date") };
  } else if (type === "calvings") {
    const [calvings, offspring] = await Promise.all([
      allRows<Calving>("calvings", "calving_date"), allRows<CalvingOffspring>("calving_offspring", "calving_id"),
    ]);
    source = { animals, calvings, offspring };
  }
  return buildAnimalReport(type, filters, source);
}
