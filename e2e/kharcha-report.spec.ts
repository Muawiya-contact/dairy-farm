import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { signIn, todayPK } from "./helpers";

test("Kharcha Report filters periods, prints, downloads, and shares with a fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
  });
  await signIn(page);
  await page.goto("/reports/kharcha/");
  await expect(page.getByRole("heading", { name: "Kharcha Report", exact: true })).toBeVisible();

  const today = todayPK();
  const previousMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
  const previousMonth = previousMonthEnd.slice(0, 7);
  const viewportWidth = page.viewportSize()?.width ?? 360;

  await page.getByRole("button", { name: "Ek tareekh", exact: true }).click();
  await page.getByLabel("Kharcha report tareekh").fill(today);
  await expect(page.getByRole("heading", { name: `${today} ka khulasa` })).toBeVisible();

  await page.getByRole("button", { name: "Tareekh se tak", exact: true }).click();
  await page.getByLabel("Kharcha report shuru").fill(previousMonthEnd);
  await page.getByLabel("Kharcha report aakhir").fill(today);
  await expect(page.getByRole("heading", { name: `${previousMonthEnd} se ${today} ka khulasa` })).toBeVisible();

  await page.getByRole("button", { name: "Mahina", exact: true }).click();
  await page.getByLabel("Kharcha report maheena").fill(previousMonth);
  await expect(page.getByRole("heading", { name: `${previousMonth}-01 se ${previousMonthEnd} ka khulasa` })).toBeVisible();

  await page.getByRole("button", { name: "Saal", exact: true }).click();
  await page.getByLabel("Kharcha report saal").fill("1900");
  await expect(page.getByRole("heading", { name: "1900-01-01 se 1900-12-31 ka khulasa" })).toBeVisible();
  await expect(page.getByText("Is muddat mein kharcha darj nahi hai.")).toBeVisible();

  await page.getByRole("button", { name: "Sab record", exact: true }).click();
  const allTimeFrom = await page.getByText(new RegExp(`^\\d{4}-\\d{2}-\\d{2} se ${today} tak$|^Abhi koi entry nahi; ${today} ka khali report dikhayega\\.$`)).textContent();
  expect(allTimeFrom).toContain(today);

  const filename = `kharcha-report-${previousMonthEnd}-to-${today}.pdf`;
  await page.getByRole("button", { name: "Tareekh se tak", exact: true }).click();
  await page.getByLabel("Kharcha report shuru").fill(previousMonthEnd);
  await page.getByLabel("Kharcha report aakhir").fill(today);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(filename);

  const shareFallback = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF share karein", exact: true }).click();
  expect((await shareFallback).suggestedFilename()).toBe(filename);

  const printPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const printPage = await printPopup;
  await expect(printPage.getByRole("heading", { name: "Kharchay ka khulasa" })).toBeVisible();
  await expect(printPage.getByRole("heading", { name: "Tafseeli kharchay" })).toBeVisible();
  await expect(page.getByText("Report print ke liye tayyar hai.", { exact: true })).toBeVisible();
  await printPage.close();

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
