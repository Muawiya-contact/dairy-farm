import { expect, test } from "@playwright/test";
import { go, signIn } from "./helpers";

const reports = [
  "Tamam janwar",
  "Gaye ki report",
  "Bhains ki report",
  "Kharid aur farokht",
  "Rozana aur maahana doodh",
  "Zyada aur kam doodh",
  "Sehat, teekay aur ilaj",
  "Gaabhan janwar",
  "Bachay paida hone ka record",
  "Khushk janwar",
] as const;

test("Animal Report loads every database-backed view and exports an empty filtered report", async ({ page }) => {
  await signIn(page);
  await go(page, "Reports");
  await page.getByRole("link", { name: "Animal Report", exact: true }).click();

  const types = page.getByRole("navigation", { name: "Animal report types" });
  await expect(types.getByRole("button")).toHaveCount(reports.length);
  for (const title of reports) {
    await types.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.locator("h2").filter({ hasText: title }).first()).toBeVisible();
    await expect(page.getByRole("status", { name: "Animal Report load ho rahi hai…" })).toHaveCount(0);
    await expect(page.getByText(/Animal Report nahi khuli|Janwaron ki fehrist nahi mili/)).toHaveCount(0);
  }

  await types.getByRole("button", { name: /Gaye ki report/ }).click();
  await expect(page.getByLabel("Animal report species")).toHaveCount(0);
  await types.getByRole("button", { name: /Rozana aur maahana doodh/ }).click();
  await expect(page.getByLabel("Animal report start date")).toBeVisible();
  await expect(page.getByLabel("Animal report end date")).toBeVisible();

  await page.getByRole("searchbox", { name: "Animal report search" }).fill(`no-animal-match-${Date.now()}`);
  await expect(page.getByText(/database mein koi record nahi mila/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^animal-report-milk-.*\.pdf$/);

  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
