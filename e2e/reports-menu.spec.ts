import { expect, test } from "@playwright/test";
import { go, signIn } from "./helpers";

test("Reports menu routes each category to its matching entry page", async ({ page }) => {
  await signIn(page);
  await go(page, "Reports");

  const menu = page.getByRole("navigation", { name: "Report categories" });
  await expect(menu.getByRole("link")).toHaveCount(9);
  const destinations = [
    ["Customer Report", "Customer Report"],
    ["Milk Report", "Milk Report"],
    ["Khata Report", "Khata Summary"],
    ["Kharcha Report", "Kharcha Report"],
    ["Stock ki Report", "Stock ki Report"],
    ["Animal Report", "Animal Report"],
    ["Maali Report", "Maali Report"],
    ["Accounts Report", "Accounts Report"],
    ["Final Report", "Final Report"],
  ] as const;

  for (const [label, heading] of destinations) {
    await menu.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Wapas", exact: true }).click();
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
