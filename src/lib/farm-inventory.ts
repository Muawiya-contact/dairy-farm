import type { Database, Tables } from "./database.types";
import { getSupabase } from "./supabase";

export type InventoryCategory = Tables<"inventory_categories">;
export type InventoryItem = Tables<"inventory_items">;
export type InventoryStock = Database["public"]["Functions"]["inventory_stock_on"]["Returns"][number];
export type InventoryMovement = Database["public"]["Functions"]["inventory_item_history"]["Returns"][number];
export type InventoryReportSummary = Database["public"]["Functions"]["inventory_report_summary"]["Returns"][number];
export type InventoryReportUsage = Database["public"]["Functions"]["inventory_report_usage_by_staff"]["Returns"][number];
export type InventoryReportTransaction = Database["public"]["Functions"]["inventory_report_transactions"]["Returns"][number];
export type InventoryAccount = Pick<Tables<"accounts">, "id" | "name" | "active" | "opening_date">;
export type InventoryExpenseCategory = Pick<Tables<"expense_categories">, "id" | "name" | "active" | "is_farm_cost" | "is_salary" | "sort_order">;
export type InventoryStaff = Pick<Tables<"staff">, "id" | "name" | "active">;

export const INVENTORY_UNITS = ["kg", "g", "litre", "ml", "bag", "bori", "piece", "bottle", "ton"] as const;
export type InventoryUnit = typeof INVENTORY_UNITS[number];
export const INVENTORY_UNIT_LABEL: Record<InventoryUnit, string> = {
  kg: "kg", g: "gram", litre: "litre", ml: "ml", bag: "bag", bori: "bori",
  piece: "piece", bottle: "bottle", ton: "ton",
};

export async function getInventoryStock(asOf: string) {
  const { data, error } = await getSupabase().rpc("inventory_stock_on", { p_as_of: asOf });
  if (error) throw error;
  return data ?? [];
}

export async function loadInventorySetup() {
  const db = getSupabase();
  const [categories, accounts, expenseCategories, staff] = await Promise.all([
    db.from("inventory_categories").select("*").order("sort_order").order("name"),
    db.from("accounts").select("id,name,active,opening_date").order("name"),
    db.from("expense_categories").select("id,name,active,is_farm_cost,is_salary,sort_order").order("sort_order"),
    db.from("staff").select("id,name,active").eq("active", true).order("name"),
  ]);
  for (const result of [categories, accounts, expenseCategories, staff]) if (result.error) throw result.error;
  return {
    categories: (categories.data ?? []) as InventoryCategory[],
    accounts: (accounts.data ?? []) as InventoryAccount[],
    expenseCategories: (expenseCategories.data ?? []) as InventoryExpenseCategory[],
    staff: (staff.data ?? []) as InventoryStaff[],
  };
}

export async function loadInventoryReportStaff() {
  const { data, error } = await getSupabase().from("staff").select("id,name,active").order("name");
  if (error) throw error;
  return (data ?? []) as InventoryStaff[];
}

export async function getInventoryItems() {
  const { data, error } = await getSupabase().from("inventory_items").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getInventoryHistory(itemId: string, from: string, to: string) {
  const { data, error } = await getSupabase().rpc("inventory_item_history", {
    p_item_id: itemId, p_from: from, p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getInventoryReportSummary(from: string, to: string, itemId: string | null, categoryId: string | null) {
  const { data, error } = await getSupabase().rpc("inventory_report_summary", {
    p_from: from, p_to: to, p_item_id: itemId, p_category_id: categoryId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getInventoryReportUsage(from: string, to: string, itemId: string | null,
  categoryId: string | null, staffId: string | null, unassigned: boolean) {
  const { data, error } = await getSupabase().rpc("inventory_report_usage_by_staff", {
    p_from: from, p_to: to, p_item_id: itemId, p_category_id: categoryId,
    p_staff_id: staffId, p_unassigned: unassigned,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getInventoryReportTransactions(input: {
  from: string; to: string; itemId: string | null; categoryId: string | null;
  staffId: string | null; unassigned: boolean; search: string; limit: number; offset: number;
}) {
  const { data, error } = await getSupabase().rpc("inventory_report_transactions", {
    p_from: input.from, p_to: input.to, p_item_id: input.itemId, p_category_id: input.categoryId,
    p_staff_id: input.staffId, p_unassigned: input.unassigned, p_search: input.search || null,
    p_limit: input.limit, p_offset: input.offset,
  });
  if (error) throw error;
  return data ?? [];
}

export async function createInventoryCategory(requestId: string, name: string, description: string) {
  const { error } = await getSupabase().rpc("create_inventory_category_once", {
    p_request_id: requestId, p_name: name, p_description: description || null,
  });
  if (error) throw error;
}

export async function updateInventoryCategory(category: InventoryCategory) {
  const { error } = await getSupabase().rpc("update_inventory_category", {
    p_category_id: category.id, p_revision: category.revision, p_name: category.name,
    p_description: category.description, p_active: category.active,
  });
  if (error) throw error;
}

export async function createInventoryItem(input: {
  requestId: string; name: string; categoryId: string; unit: InventoryUnit; type: "consumable" | "durable";
  minimum: number; opening: number; openingUnit: InventoryUnit; openingDate: string;
}) {
  const { data, error } = await getSupabase().rpc("create_inventory_item_once", {
    p_request_id: input.requestId, p_name: input.name, p_category_id: input.categoryId,
    p_base_unit: input.unit, p_item_type: input.type, p_minimum_stock: input.minimum,
    p_opening_quantity: input.opening, p_opening_unit: input.openingUnit, p_opening_date: input.openingDate,
  });
  if (error) throw error;
  return data;
}

export async function updateInventoryItem(item: InventoryItem) {
  const { error } = await getSupabase().rpc("update_inventory_item", {
    p_item_id: item.id, p_revision: item.revision, p_name: item.name, p_category_id: item.category_id,
    p_base_unit: item.base_unit, p_item_type: item.item_type, p_minimum_stock: item.minimum_stock,
    p_active: item.active,
  });
  if (error) throw error;
}

export async function recordInventoryPurchase(input: {
  requestId: string; itemId: string; quantity: number; unit: InventoryUnit; rate: number; total: number;
  date: string; accountId: string; expenseCategoryId: string; supplier: string; reference: string;
  note: string; batch: string; expiry: string;
}) {
  const { error } = await getSupabase().rpc("record_inventory_purchase", {
    p_request_id: input.requestId, p_item_id: input.itemId, p_quantity: input.quantity, p_unit: input.unit,
    p_unit_rate: input.rate, p_total_amount: input.total, p_movement_date: input.date,
    p_account_id: input.accountId, p_expense_category_id: input.expenseCategoryId,
    p_supplier: input.supplier || null, p_reference: input.reference || null, p_note: input.note || null,
    p_batch_code: input.batch || null, p_expiry_date: input.expiry || null,
  });
  if (error) throw error;
}

export async function recordInventoryUsage(input: {
  requestId: string; itemId: string; quantity: number; unit: InventoryUnit; date: string;
  purpose: string; staffId: string | null; note: string;
}) {
  const { error } = await getSupabase().rpc("record_inventory_usage", {
    p_request_id: input.requestId, p_item_id: input.itemId, p_quantity: input.quantity, p_unit: input.unit,
    p_movement_date: input.date, p_purpose: input.purpose, p_staff_id: input.staffId, p_note: input.note || null,
  });
  if (error) throw error;
}

export async function recordInventoryAdjustment(input: {
  requestId: string; itemId: string; quantity: number; unit: InventoryUnit; direction: -1 | 1;
  date: string; type: "adjustment" | "wastage"; reason: string; note: string;
}) {
  const { error } = await getSupabase().rpc("record_inventory_adjustment", {
    p_request_id: input.requestId, p_item_id: input.itemId, p_quantity: input.quantity, p_unit: input.unit,
    p_direction: input.direction, p_movement_date: input.date, p_movement_type: input.type,
    p_reason: input.reason, p_note: input.note || null,
  });
  if (error) throw error;
}
