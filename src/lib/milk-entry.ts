import { parseLitres } from "./format";

export function milkLitres(raw: string, maximum: number): number {
  const value = parseLitres(raw);
  if (value > maximum) throw new RangeError(`Doodh ${maximum} L se zyada nahi ho sakta.`);
  return value;
}

export function sumMilkLitres(values: readonly number[]): number {
  return values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
}

export function remainingMilk(produced: number, delivered: number): number {
  return (Math.round(produced * 100) - Math.round(delivered * 100)) / 100;
}

const shiftOrder: Record<string, number> = { morning: 0, noon: 1, evening: 2 };

/** Stock carried into a shift, using the database's running shift balances. */
export function milkShiftOpeningStock(
  dayOpening: number,
  shifts: readonly { milk_shift: string; opening_litres: number; remaining_litres: number }[],
  selectedShift: string,
): number {
  const current = shifts.find((row) => row.milk_shift === selectedShift);
  if (current) return current.opening_litres;
  const currentOrder = shiftOrder[selectedShift] ?? Number.MAX_SAFE_INTEGER;
  const previous = shifts
    .filter((row) => (shiftOrder[row.milk_shift] ?? Number.MAX_SAFE_INTEGER) < currentOrder)
    .sort((a, b) => (shiftOrder[a.milk_shift] ?? 0) - (shiftOrder[b.milk_shift] ?? 0))
    .at(-1);
  return previous?.remaining_litres ?? dayOpening;
}

export type MilkDispositionType = "free" | "internal" | "wastage";
export type MilkDispositionCategory =
  | "employee" | "friend" | "guest" | "charity" | "other"
  | "owner_home" | "farm_use" | "spillage" | "spoiled";
export type MilkDispositionInput = {
  disposition_type: MilkDispositionType;
  category: MilkDispositionCategory;
  litres: number;
  recipient: string | null;
  note: string | null;
};
export type MilkDispositionDraft = Omit<MilkDispositionInput, "litres" | "recipient" | "note"> & { key: string; litres: string; recipient: string; note: string };

/** Parse shift use/waste rows before adding them to customer deliveries. */
export function parseMilkDispositions(rows: MilkDispositionDraft[]): MilkDispositionInput[] {
  return rows.flatMap((row) => {
    const recipientValue = row.recipient?.trim() ?? "";
    const noteValue = row.note?.trim() ?? "";
    if (!row.litres.trim()) {
      if (recipientValue || noteValue) throw new RangeError("Pehle is disposition ki litres likhein ya row hata dein.");
      return [];
    }
    const quantity = milkLitres(row.litres, 5000);
    if (quantity === 0) return [];
    if (recipientValue.length > 200 || noteValue.length > 500) throw new RangeError("Naam 200 aur note 500 harf tak rakhein.");
    if (row.disposition_type === "wastage" && noteValue.length < 3) throw new RangeError("Zaya doodh ki kam az kam 3 harf ki wajah likhein.");
    if (row.disposition_type === "free" && recipientValue.length < 3 && noteValue.length < 3) {
      throw new RangeError("Muft doodh ke recipient ka naam ya note likhein.");
    }
    return [{
      disposition_type: row.disposition_type,
      category: row.category,
      litres: quantity,
      recipient: recipientValue || null,
      note: noteValue || null,
    }];
  });
}

export function sumDispositionLitres(rows: readonly Pick<MilkDispositionInput, "litres">[]): number {
  return sumMilkLitres(rows.map((row) => row.litres));
}

/** Recalculate from the latest form state so two quick taps cannot add the remainder twice. */
export function fillCompanyMilk(produced: number, quantities: Record<string, string>, companyId: string, otherAllocated = 0): Record<string, string> {
  const delivered = sumMilkLitres(Object.values(quantities).map((raw) => Number(raw) || 0));
  const available = Math.max(0, remainingMilk(produced, delivered + otherAllocated));
  if (!available) return quantities;
  return { ...quantities, [companyId]: String(sumMilkLitres([Number(quantities[companyId]) || 0, available])) };
}

/** Blank entries are omitted; an explicit zero is recorded so milk-drop alerts can detect a drop to zero. */
export function animalMilkRows(animals: readonly { id: string }[], values: Record<string, string>) {
  return animals.flatMap((animal) => {
    const raw = values[animal.id]?.trim();
    if (!raw) return [];
    const litres = milkLitres(raw, 60);
    return [{ animal_id: animal.id, litres }];
  });
}
