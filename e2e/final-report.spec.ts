import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("Final Report updates its selected period and fits the viewport", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/final/");
  await expect(page.getByRole("heading", { name: "Farm ki performance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Doodh ki paidawar aur taqseem" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer Khata ka maahana hisaab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excel download" })).toBeVisible();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF download" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe("%PDF-");

  const previousMonth = page.getByRole("button", { name: "Pichla maheena" });
  await previousMonth.click();
  await expect(previousMonth).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Final Report shuru ki tareekh")).not.toHaveValue("");
  await expect(page.getByLabel("Final Report aakhri tareekh")).not.toHaveValue("");

  const viewportWidth = page.viewportSize()?.width ?? 1366;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Farm ki performance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF download" })).not.toBeVisible();
});
