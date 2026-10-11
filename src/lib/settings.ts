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

const storageKey = "dairy-farm-preview-settings";

const defaultSettings: FarmSettings = {
  id: 1,
  farm_name: "Demo Dairy Farm",
  owner_name: "Chaudhry Sahab",
  default_milk_rate: 150,
  ultrasound_days: 30,
  checkup_days: 75,
  dry_off_days: 210,
  calving_days: 270,
  fresh_days: 60,
  whatsapp_footer: "Shukriya",
};

export async function getSettings(): Promise<FarmSettings> {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) return { ...defaultSettings, ...JSON.parse(saved), id: 1 };
  } catch {
    // Keep the preview usable when browser storage is unavailable or invalid.
  }
  return defaultSettings;
}

export async function updateSettings(settings: Omit<FarmSettings, "id">): Promise<FarmSettings> {
  const value = { ...settings, id: 1 as const };
  window.localStorage.setItem(storageKey, JSON.stringify(value));
  return value;
}
