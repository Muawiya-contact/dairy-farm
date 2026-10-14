import { expect, it } from "vitest";
import { validateSettings, type FarmSettings } from "../../src/lib/settings";

const settings: Omit<FarmSettings, "id"> = {
  farm_name: "Demo Farm", owner_name: "Demo Owner", contact_phone: "", default_milk_rate: 180,
  ultrasound_days: 30, checkup_days: 75, dry_off_days: 210,
  calving_days: 270, fresh_days: 60, whatsapp_footer: "Shukriya",
};

it("validates the breeding ranges before saving", () => {
  expect(validateSettings(settings)).toBeNull();
  expect(validateSettings({ ...settings, calving_days: 199 })).toContain("Bachha");
  expect(validateSettings({ ...settings, fresh_days: 201 })).toContain("Fresh");
  expect(validateSettings({ ...settings, default_milk_rate: 0 })).toContain("rate");
  expect(validateSettings({ ...settings, default_milk_rate: 12.345 })).toContain("2 decimal");
  expect(validateSettings({ ...settings, default_milk_rate: 100_000_000 })).toContain("10 crore");
  expect(validateSettings({ ...settings, farm_name: " " })).toContain("naam");
  expect(validateSettings({ ...settings, contact_phone: "invalid" })).toContain("Phone number");
  expect(validateSettings({ ...settings, contact_phone: "+923001234567" })).toBeNull();
});
