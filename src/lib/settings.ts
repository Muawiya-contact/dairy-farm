import { getSupabase } from "./supabase";

export type FarmSettings = {
  id: 1;
  farm_name: string;
  owner_name: string;
  default_milk_rate: number;
  ultrasound_days: number;
  checkup_days: number;
  dry_off_days: number;
  calving_days: number;
  fresh_days: number;
  whatsapp_footer: string;
};

export async function getSettings(): Promise<FarmSettings> {
  const { data, error } = await getSupabase().from("settings").select(
    "id,farm_name,owner_name,default_milk_rate,ultrasound_days,checkup_days,dry_off_days,calving_days,fresh_days,whatsapp_footer",
  ).eq("id", 1).single();
  if (error) throw error;
  return data as FarmSettings;
}

export async function updateSettings(settings: Omit<FarmSettings, "id">): Promise<FarmSettings> {
  const { data, error } = await getSupabase().from("settings").update(settings).eq("id", 1).select(
    "id,farm_name,owner_name,default_milk_rate,ultrasound_days,checkup_days,dry_off_days,calving_days,fresh_days,whatsapp_footer",
  ).single();
  if (error) throw error;
  return data as FarmSettings;
}
