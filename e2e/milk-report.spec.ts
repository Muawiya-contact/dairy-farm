import { expect, test } from "@playwright/test";
import { addDays, daysBetween } from "../src/lib/dates";
import { signIn, todayPK } from "./helpers";

test("customer and animal milk reports load filtered records and export PDFs", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/milk/");
  await expect(page.getByRole("heading", { name: "Milk Report", exact: true })).toBeVisible();

  const today = todayPK();
  const weekFrom = addDays(today, -6);
  await page.getByRole("button", { name: "Hafta", exact: true }).click();
  await expect(page.getByLabel("Milk Report shuru ki tareekh")).toHaveValue(weekFrom);
  await expect(page.getByRole("heading", { name: `${weekFrom} se ${today} ka grand summary` })).toBeVisible();
  await expect(page.getByRole("table").first().locator("tbody tr")).toHaveCount(7);
  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);

  const milkDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF download" }).click();
  expect((await milkDownload).suggestedFilename()).toBe(`milk-report-${weekFrom}-to-${today}.pdf`);

  await page.getByRole("link", { name: "Animal-wise Milk Report kholein" }).click();
  await expect(page.getByRole("heading", { name: "Animal-wise Milk Report" })).toBeVisible();
  const tag = page.getByRole("combobox", { name: "Janwar ka tag number" });
  await expect(tag.locator("option", { hasText: "101" })).toHaveCount(1);
  await tag.selectOption({ label: "101" });
  await expect(page.getByRole("heading", { name: "101 ka period summary" })).toBeVisible();
  await expect(page.getByText("Koi production record nahi")).toBeVisible();
  await page.getByRole("button", { name: "Saal", exact: true }).click();
  await expect(page.getByLabel("Animal Milk Report shuru ki tareekh")).toHaveValue(`${today.slice(0, 4)}-01-01`);
  await page.getByRole("button", { name: "Sab record", exact: true }).click();
  const animalFrom = await page.getByLabel("Animal Milk Report shuru ki tareekh").inputValue();
  await expect(page.getByRole("table").last().locator("tbody tr")).toHaveCount(daysBetween(animalFrom, today) + 1);

  const animalDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF download" }).click();
  expect((await animalDownload).suggestedFilename()).toBe(`animal-101-milk-${animalFrom}-to-${today}.pdf`);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
