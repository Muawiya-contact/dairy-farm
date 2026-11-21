import { getSupabase } from "./supabase";
import { INVENTORY_UNITS, type InventoryUnit } from "./farm-inventory";
import type { AnimalFeedRecord } from "./farm-data";

export type AnimalFeedOption = {
  id: string;
  name: string;
  category_name: string;
  base_unit: InventoryUnit;
  current_stock: number;
};

export type AnimalFeedPeriodTotal = {
  item_id: string;
  item_name: string;
  category_name: string;
  quantity: number;
  unit: string;
  entries: number;
};

function unitFamily(unit: string): string {
  if (["kg", "g", "ton"].includes(unit)) return "weight";
  if (["litre", "ml"].includes(unit)) return "volume";
  return unit;
}

export function compatibleFeedUnits(baseUnit: string): InventoryUnit[] {
  const family = unitFamily(baseUnit);
  return INVENTORY_UNITS.filter((unit) => unitFamily(unit) === family);
}

export function activeAnimalFeedRecords(records: AnimalFeedRecord[]): AnimalFeedRecord[] {
  const replaced = new Set(records.flatMap((record) => record.supersedes_id ? [record.supersedes_id] : []));
  return records.filter((record) => !replaced.has(record.id));
}

export function animalFeedPeriodTotals(records: AnimalFeedRecord[], from: string, to: string): AnimalFeedPeriodTotal[] {
  const groups = new Map<string, AnimalFeedPeriodTotal & { micros: number }>();
  for (const entry of activeAnimalFeedRecords(records)) {
    if (entry.feed_date < from || entry.feed_date > to) continue;
    const key = `${entry.inventory_item_id}:${entry.stock_unit}`;
    const group = groups.get(key) ?? {
      item_id: entry.inventory_item_id, item_name: entry.item_name, category_name: entry.category_name,
      quantity: 0, unit: entry.stock_unit, entries: 0, micros: 0,
    };
    group.micros += Math.round(Number(entry.stock_quantity) * 1_000_000);
    group.entries += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map(({ micros, ...summary }) => ({ ...summary, quantity: micros / 1_000_000 }))
    .sort((a, b) => a.item_name.localeCompare(b.item_name));
}

export async function loadAnimalFeedOptions(asOf: string): Promise<AnimalFeedOption[]> {
  const db = getSupabase();
  const [categoriesResult, itemsResult, stockResult] = await Promise.all([
    db.from("inventory_categories").select("id,name,active").eq("active", true).order("name"),
    db.from("inventory_items").select("id,name,category_id,base_unit,item_type,active").eq("active", true).eq("item_type", "consumable").order("name"),
    db.rpc("inventory_stock_on", { p_as_of: asOf }),
  ]);
  for (const result of [categoriesResult, itemsResult, stockResult]) if (result.error) throw result.error;
  const categories = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
  const stock = new Map((stockResult.data ?? []).map((row) => [row.item_id, Number(row.current_stock)]));
  return (itemsResult.data ?? []).flatMap((item) => {
    const categoryName = categories.get(item.category_id);
    if (!categoryName || categoryName.trim().toLocaleLowerCase() !== "animal feed & fodder") return [];
    return [{ id: item.id, name: item.name, category_name: categoryName, base_unit: item.base_unit as InventoryUnit,
      current_stock: stock.get(item.id) ?? 0 }];
  });
}

export async function saveAnimalFeedRecord(input: {
  requestId: string; animalId: string; itemId: string; quantity: number; unit: InventoryUnit; date: string; note: string | null;
}) {
  const { data, error } = await getSupabase().rpc("record_animal_feed_once", {
    p_request_id: input.requestId, p_animal_id: input.animalId, p_item_id: input.itemId,
    p_quantity: input.quantity, p_unit: input.unit, p_feed_date: input.date, p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function correctAnimalFeedRecord(input: {
  requestId: string; feedEntryId: string; itemId: string; quantity: number; unit: InventoryUnit; note: string | null;
}) {
  const { data, error } = await getSupabase().rpc("correct_animal_feed_once", {
    p_request_id: input.requestId, p_feed_entry_id: input.feedEntryId, p_item_id: input.itemId,
    p_quantity: input.quantity, p_unit: input.unit, p_note: input.note,
  });
  if (error) throw error;
  return data;
}
