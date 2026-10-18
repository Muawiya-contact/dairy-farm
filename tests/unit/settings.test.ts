import { expect, it } from "vitest";
import { validateSettings, type FarmSettings } from "../../src/lib/settings";

const settings: Omit<FarmSettings, "id"> = {
  farm_name: "Demo Farm", owner_name: "Demo Owner", contact_phone: "", default_milk_rate: 180,
  ultrasound_days: 30, checkup_days: 75, dry_off_days: 210,
  calving_days: 270, fresh_days: 60, reminder_days: 7, calving_reminder_days: 30, whatsapp_footer: "Shukriya",
  gyarhwin_reminder_enabled: true, hijri_date_adjustment: 0,
  eid_fitr_start_date: null, eid_adha_start_date: null,
};

it("validates the breeding ranges before saving", () => {
  expect(validateSettings(settings)).toBeNull();
  expect(validateSettings({ ...settings, calving_days: 199 })).toContain("Bachha");
  expect(validateSettings({ ...settings, fresh_days: 201 })).toContain("Fresh");
  expect(validateSettings({ ...settings, reminder_days: 0 })).toContain("1 se 30");
  expect(validateSettings({ ...settings, reminder_days: 31 })).toContain("1 se 30");
  expect(validateSettings({ ...settings, default_milk_rate: 0 })).toContain("rate");
  expect(validateSettings({ ...settings, default_milk_rate: 12.345 })).toContain("2 decimal");
  expect(validateSettings({ ...settings, default_milk_rate: 100_000_000 })).toContain("10 crore");
  expect(validateSettings({ ...settings, farm_name: " " })).toContain("naam");
  expect(validateSettings({ ...settings, contact_phone: "invalid" })).toContain("Phone number");
  expect(validateSettings({ ...settings, contact_phone: "+923001234567" })).toBeNull();
  expect(validateSettings({ ...settings, hijri_date_adjustment: -3 })).toContain("Hijri");
  expect(validateSettings({ ...settings, hijri_date_adjustment: 1.5 })).toContain("Hijri");
  expect(validateSettings({ ...settings, hijri_date_adjustment: 2 })).toBeNull();
  expect(validateSettings({ ...settings, eid_fitr_start_date: "2026-02-30" })).toContain("Eid ul Fitr");
  expect(validateSettings({ ...settings, eid_fitr_start_date: "2027-03-10", eid_adha_start_date: "2027-03-11" })).toContain("alag");
  expect(validateSettings({ ...settings, eid_fitr_start_date: "2027-03-10", eid_adha_start_date: "2027-05-18" })).toBeNull();
});
