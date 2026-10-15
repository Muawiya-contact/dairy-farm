import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays } from "../../src/lib/dates";
import { confirmedEidForDate } from "../../src/lib/eid";
import { estimatedHijriDate } from "../../src/lib/gyarhwin";
import { FarmObservances } from "../../src/components/FarmObservances";
import type { FarmSettings } from "../../src/lib/settings";

const settings: FarmSettings = {
  id: 1, farm_name: "Demo Farm", owner_name: "Chaudhry sahib", contact_phone: "", default_milk_rate: 150,
  ultrasound_days: 30, checkup_days: 75, dry_off_days: 210, calving_days: 270, fresh_days: 60,
  whatsapp_footer: "Shukriya", gyarhwin_reminder_enabled: true, hijri_date_adjustment: 0,
  eid_fitr_start_date: null, eid_adha_start_date: null,
};

it("shows each confirmed Pakistan Eid for exactly three civil days", () => {
  expect(confirmedEidForDate("2027-03-10", settings)).toBeNull();
  for (const field of ["eid_fitr_start_date", "eid_adha_start_date"] as const) {
    const confirmed = { ...settings, [field]: "2027-03-10" };
    expect(confirmedEidForDate("2027-03-09", confirmed)).toBeNull();
    expect(confirmedEidForDate("2027-03-10", confirmed)?.day).toBe(1);
    expect(confirmedEidForDate("2027-03-11", confirmed)?.day).toBe(2);
    expect(confirmedEidForDate("2027-03-12", confirmed)?.day).toBe(3);
    expect(confirmedEidForDate("2027-03-13", confirmed)).toBeNull();
  }
});

it("ignores invalid and unconfirmed dates", () => {
  expect(confirmedEidForDate("2027-03-10", { ...settings, eid_fitr_start_date: "2027-02-30" })).toBeNull();
  expect(renderToStaticMarkup(createElement(FarmObservances, { today: "2027-03-10", settings }))).not.toContain("Eid Mubarak");
});

it("does not prompt for an Eid date when the estimated holiday approaches", () => {
  let estimatedFitr = "2027-03-01";
  for (let i = 0; i < 20; i++, estimatedFitr = addDays(estimatedFitr, 1)) {
    const hijri = estimatedHijriDate(estimatedFitr);
    if (hijri?.month === 10 && hijri.day === 1) break;
  }
  expect(estimatedHijriDate(estimatedFitr)).toMatchObject({ month: 10, day: 1 });
  const html = renderToStaticMarkup(createElement(FarmObservances, { today: estimatedFitr, settings }));
  expect(html).not.toContain("Eid");
  expect(html).not.toContain("tasdeeq");
});

it("uses the owner name and gives Eid priority over Gyarhwin on an overlapping day", () => {
  let adhaDay = "2027-04-01";
  for (let i = 0; i < 100; i++, adhaDay = addDays(adhaDay, 1)) {
    const hijri = estimatedHijriDate(adhaDay);
    if (hijri?.month === 12 && hijri.day === 10) break;
  }
  expect(estimatedHijriDate(adhaDay)).toMatchObject({ month: 12, day: 10 });
  const html = renderToStaticMarkup(createElement(FarmObservances, {
    today: adhaDay, settings: { ...settings, eid_adha_start_date: adhaDay },
  }));
  expect(html).toContain("Assalam o Alaikum, Chaudhry sahib!");
  expect(html).toContain("Eid ul Adha Mubarak");
  expect(html).toContain("Aaj ke liye reminder band karein");
  expect(html).not.toContain("Gyarhwin");
});
