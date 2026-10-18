import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MilkCan from "../../src/components/MilkCan";
import { expectedShifts, visibleShifts } from "../../src/lib/milk-shifts";

test("the effective rule is ordered and an older noon entry stays editable", () => {
  const rules = [{ effective_from: "2026-10-10", noon_enabled: true }, { effective_from: "2026-10-12", noon_enabled: false }];
  expect(expectedShifts("2026-10-09", rules)).toEqual(["morning", "evening"]);
  expect(expectedShifts("2026-10-10", rules)).toEqual(["morning", "noon", "evening"]);
  expect(expectedShifts("2026-10-12", rules)).toEqual(["morning", "evening"]);
  expect(visibleShifts("2026-10-12", rules, [{ milk_date: "2026-10-12", shift: "noon" }]))
    .toEqual(["morning", "noon", "evening"]);
});

test("milk drum has two layers with noon off, three when noon exists", () => {
  const two = renderToStaticMarkup(<MilkCan morning={40} noon={0} evening={35} noonEnabled={false} />);
  const three = renderToStaticMarkup(<MilkCan morning={40} noon={25} evening={35} />);
  expect(two).not.toContain("bg-[#a9cfe6]");
  expect(three).toContain("bg-[#a9cfe6]");
  expect(three).toContain("dopehr 25 litre");
  expect(two).not.toContain("Dopehr 0 L");
});
