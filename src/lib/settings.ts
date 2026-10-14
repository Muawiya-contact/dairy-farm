import { getSupabase } from "./supabase";
import { normalizePhone } from "./phone";
import type { Database } from "./database.types";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type FarmSettings = Pick<SettingsRow,
  "farm_name" | "owner_name" | "contact_phone" | "default_milk_rate" | "ultrasound_days" |
  "checkup_days" | "dry_off_days" | "calving_days" | "fresh_days" | "whatsapp_footer"> & { id: 1 };

export const breedingFields = [
  { key: "ultrasound_days", label: "Ultrasound", min: 1, max: 400 },
  { key: "checkup_days", label: "Checkup", min: 1, max: 400 },
  { key: "dry_off_days", label: "Khushk", min: 1, max: 400 },
  { key: "calving_days", label: "Bachha", min: 200, max: 320 },
  { key: "fresh_days", label: "Fresh", min: 1, max: 200 },
] as const;

export function validateSettings(input: Omit<FarmSettings, "id">): string | null {
  if (!input.farm_name.trim()) return "Farm ka naam likhein.";
  try { normalizePhone(input.contact_phone); }
  catch (error) { return (error as Error).message; }
  if (!Number.isFinite(input.default_milk_rate) || input.default_milk_rate <= 0) return "Doodh ka rate zero se zyada likhein.";
  if (input.default_milk_rate > 99_999_999.99 ||
      Math.abs(input.default_milk_rate * 100 - Math.round(input.default_milk_rate * 100)) > 1e-6) {
    return "Doodh ka rate 2 decimal tak aur 10 crore se kam likhein.";
  }
  for (const field of breedingFields) {
    const value = input[field.key];
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      return `${field.label} ke din ${field.min} se ${field.max} tak likhein.`;
    }
  }
  return null;
}

const columns = "id,farm_name,owner_name,contact_phone,default_milk_rate,ultrasound_days,checkup_days,dry_off_days,calving_days,fresh_days,whatsapp_footer";

export async function getSettings(): Promise<FarmSettings> {
  const { data, error } = await getSupabase().from("settings").select(columns).eq("id", 1).single();
  if (error) throw error;
  return { ...data, id: 1, default_milk_rate: Number(data.default_milk_rate) } as FarmSettings;
}

export async function updateSettings(settings: Omit<FarmSettings, "id">): Promise<FarmSettings> {
  const validationError = validateSettings(settings);
  if (validationError) throw new RangeError(validationError);
  const { data, error } = await getSupabase().from("settings")
    .update({ ...settings, contact_phone: normalizePhone(settings.contact_phone) }).eq("id", 1).select(columns).single();
  if (error) throw error;
  return { ...data, id: 1, default_milk_rate: Number(data.default_milk_rate) } as FarmSettings;
}
