export type AnimalWeightRecord = {
  id: string;
  animal_id: string;
  weight_date: string;
  weight_kg: number;
  notes: string | null;
  created_at: string;
};

export type AnimalWeightHistoryItem = {
  id: string;
  weight_date: string;
  weight_kg: number;
  notes: string | null;
  source: "birth" | "measurement";
  created_at: string;
};

export type BirthWeight = { date: string; weight_kg: number };
export type AnimalWeightChartPoint = AnimalWeightHistoryItem & { x: number; y: number };

export function animalWeightHistory(records: AnimalWeightRecord[], birth?: BirthWeight | null): AnimalWeightHistoryItem[] {
  const history: AnimalWeightHistoryItem[] = records.map((record) => ({
    id: record.id,
    weight_date: record.weight_date,
    weight_kg: Number(record.weight_kg),
    notes: record.notes,
    source: "measurement",
    created_at: record.created_at,
  }));

  if (birth && birth.date && Number.isFinite(birth.weight_kg) && birth.weight_kg > 0) {
    history.push({
      id: `birth:${birth.date}`,
      weight_date: birth.date,
      weight_kg: birth.weight_kg,
      notes: null,
      source: "birth",
      created_at: "",
    });
  }

  return history.sort((a, b) => a.weight_date.localeCompare(b.weight_date)
    || (a.source === b.source ? 0 : a.source === "birth" ? -1 : 1)
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id));
}

export function animalWeightChange(history: AnimalWeightHistoryItem[]) {
  const latest = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  return { latest, previous, change_kg: latest && previous ? Number((latest.weight_kg - previous.weight_kg).toFixed(2)) : null };
}

export function parseAnimalWeight(raw: string): number {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value <= 0 || value > 9999.99) {
    throw new RangeError("Wazan 0 se zyada aur 9,999.99 kg ya kam likhein.");
  }
  return Math.round(value * 100) / 100;
}

export function animalWeightChart(history: AnimalWeightHistoryItem[], limit = 12): AnimalWeightChartPoint[] {
  const rows = history.slice(-limit);
  if (!rows.length) return [];

  const width = 640;
  const height = 220;
  const padding = 32;
  const values = rows.map((row) => row.weight_kg);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  return rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? width / 2 : padding + index * (width - 2 * padding) / (rows.length - 1),
    y: height - padding - (range === 0 ? (height - 2 * padding) / 2 : (row.weight_kg - minimum) / range * (height - 2 * padding)),
  }));
}
