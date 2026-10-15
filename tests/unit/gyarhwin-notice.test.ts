import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GyarhwinNotice } from "../../src/components/GyarhwinNotice";
import { addDays } from "../../src/lib/dates";
import { nextGyarhwinDate } from "../../src/lib/gyarhwin";
import type { FarmSettings } from "../../src/lib/settings";

const settings: FarmSettings = {
  id: 1, farm_name: "Demo Farm", owner_name: "Owner", contact_phone: "", default_milk_rate: 150,
  ultrasound_days: 30, checkup_days: 75, dry_off_days: 210, calving_days: 270, fresh_days: 60,
  whatsapp_footer: "Shukriya", gyarhwin_reminder_enabled: true, hijri_date_adjustment: 0,
};
const eleventh = nextGyarhwinDate("2026-10-15", 0)!;

it("shows a concise Gyarhwin cue only on the relevant estimated day", () => {
  const preparation = renderToStaticMarkup(createElement(GyarhwinNotice, { today: addDays(eleventh, -1), settings }));
  expect(preparation).toContain("Gyarhwin ki tayyari");
  expect(preparation).toContain("Maghrib");
  expect(preparation).toContain("Zaroorat ho to kal ka doodh plan karein.");
  expect(preparation).not.toContain("Tareekh adjust karein");

  const today = renderToStaticMarkup(createElement(GyarhwinNotice, { today: eleventh, settings }));
  expect(today).toContain("Aaj Gyarhwin hai");
  expect(today).toContain("Khairaat ka diya hua doodh Muft customer ke naam darj karein.");

  expect(renderToStaticMarkup(createElement(GyarhwinNotice, { today: eleventh, settings: { ...settings, gyarhwin_reminder_enabled: false } }))).toBe("");
  expect(renderToStaticMarkup(createElement(GyarhwinNotice, { today: addDays(eleventh, 1), settings }))).toBe("");
});
