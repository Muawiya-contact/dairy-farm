import type { Insemination } from "./farm-data";
import { daysBetween } from "./dates";

export type Newborn = {
  outcome: "alive" | "stillborn";
  sex: "female" | "male" | null;
  tag: string | null;
  name: string | null;
  birth_weight_kg: string | null;
  notes: string | null;
};

export type BreedingDueField = "ultrasound" | "checkup" | "dry_off" | "calving";
export type BreedingDueRecord = Pick<Insemination, "ultrasound_due" | "checkup_due" | "dry_off_due" | "calving_due">
  & Partial<Pick<Insemination, "ultrasound_due_override" | "checkup_due_override" | "dry_off_due_override" | "calving_due_override">>;
export function breedingDueDate(record: BreedingDueRecord, field: BreedingDueField): { date: string; overridden: boolean } {
  const calculated: Record<BreedingDueField, string> = {
    ultrasound: record.ultrasound_due,
    checkup: record.checkup_due,
    dry_off: record.dry_off_due,
    calving: record.calving_due,
  };
  const override: Record<BreedingDueField, string | null> = {
    ultrasound: record.ultrasound_due_override ?? null,
    checkup: record.checkup_due_override ?? null,
    dry_off: record.dry_off_due_override ?? null,
    calving: record.calving_due_override ?? null,
  };
  return { date: override[field] ?? calculated[field], overridden: override[field] !== null };
}

const optional = (form: FormData, key: string) => String(form.get(key) ?? "").trim() || null;

export function parseCalving(form: FormData, count: number, serviceDate: string, today: string) {
  const date = String(form.get("calving_date") ?? "");
  try {
    if (daysBetween(serviceDate, date) < 0 || daysBetween(date, today) < 0) throw new RangeError();
  } catch { throw new RangeError("Paidaish ki tareekh tukhm rezi se aaj tak honi chahiye."); }
  if (count !== 1 && count !== 2) throw new RangeError("Aik ya do bachay darj karein.");
  const offspring: Newborn[] = [];
  for (let index = 0; index < count; index++) {
    const outcome = String(form.get(`outcome_${index}`));
    const sex = optional(form, `sex_${index}`);
    const tag = optional(form, `tag_${index}`);
    const weight = optional(form, `weight_${index}`);
    if (outcome !== "alive" && outcome !== "stillborn") throw new RangeError("Bachay ka nateeja chunein.");
    if ((sex !== null && sex !== "female" && sex !== "male") || (outcome === "alive" && sex === null))
      throw new RangeError("Zinda bachay ki jins chunein.");
    if (tag && tag.length > 60) throw new RangeError("Bachay ka tag 60 huroof se kam rakhein.");
    if (weight && (!/^\d+(\.\d{1,2})?$/.test(weight) || Number(weight) <= 0 || Number(weight) > 999.99))
      throw new RangeError("Paidaish ka wazan 0 se zyada aur 999.99 kg tak likhein.");
    offspring.push({ outcome, sex: sex as Newborn["sex"], tag: outcome === "alive" ? tag : null,
      name: outcome === "alive" ? optional(form, `name_${index}`) : null,
      birth_weight_kg: weight, notes: optional(form, `child_notes_${index}`) });
  }
  const tags = offspring.map((child) => child.tag?.toLocaleLowerCase()).filter(Boolean);
  if (new Set(tags).size !== tags.length) throw new RangeError("Dono bachon ke tag alag likhein.");
  const easeText = optional(form, "ease_score");
  const ease = easeText === null ? null : Number(easeText);
  if (ease !== null && (!Number.isInteger(ease) || ease < 1 || ease > 5))
    throw new RangeError("Paidaish ki mushkil ka score 1 se 5 tak likhein.");
  return { date, offspring, ease, notes: optional(form, "notes") };
}

export function nextBreedingTask(record: Insemination, today?: string, animalLifeStatus = "active"): { label: string; date: string } | null {
  const ultrasound = breedingDueDate(record, "ultrasound").date;
  const checkup = breedingDueDate(record, "checkup").date;
  const dryOff = breedingDueDate(record, "dry_off").date;
  const calving = breedingDueDate(record, "calving").date;
  if (animalLifeStatus !== "active") return null;
  if (record.status === "pending") {
    if (record.ultrasound_result === "empty") return { label: "Nateeja update", date: record.ultrasound_date ?? ultrasound };
    if (!record.ultrasound_result) return { label: "Ultrasound", date: ultrasound };
    if (record.checkup_result === "empty") return { label: "Nateeja update", date: record.checkup_date ?? checkup };
    if (!record.checkup_result) return { label: "Checkup", date: checkup };
    return { label: "Nateeja update", date: record.checkup_date ?? checkup };
  }
  if (record.status === "pregnant") {
    if (today && calving <= today) return { label: "Paidaish", date: calving };
    if (!record.dry_off_date) return { label: "Khushk hone ki jaanch", date: dryOff };
    return { label: "Paidaish", date: calving };
  }
  return null;
}
