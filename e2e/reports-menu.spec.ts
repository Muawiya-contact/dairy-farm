import { expect, test } from "@playwright/test";
import { go, signIn } from "./helpers";

test("Reports menu groups all nine categories and routes each group to its existing report", async ({ page }) => {
  await signIn(page);
  await go(page, "Reports");

  const menu = page.getByRole("navigation", { name: "Report categories" });
  await expect(menu.locator("section")).toHaveCount(9);
  await expect(menu.getByRole("link")).toHaveCount(18);
  const destinations = [
    ["Customer Reports", "Customer statements and sales", "Customer Report"],
    ["Milk Reports", "Production, destinations and collections", "Milk Report"],
    ["Purchase Reports", "Purchases by item and supplier", "Stock ki Report"],
    ["Sales Reports", "Milk cash and Khata sales", "Milk Report"],
    ["Accounts Reports", "Accounts and owner movements", "Accounts Report"],
    ["Financial Reports", "Income, expenses and profit/loss", "Maali Report"],
    ["Animal Reports", "Animal inventory, health and breeding", "Animal Report"],
    ["Feed & Inventory Reports", "Stock, purchases and usage", "Stock ki Report"],
    ["Farm Analytics", "Monthly Farm Performance", "Final Report"],
  ] as const;

  for (const [groupName, reportLink, heading] of destinations) {
    const group = menu.locator("section").filter({ has: page.getByRole("heading", { name: groupName, exact: true }) });
    await group.getByRole("link", { name: reportLink, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Wapas", exact: true }).click();
    await expect(menu.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
  }

  const feedGroup = menu.locator("section").filter({ has: page.getByRole("heading", { name: "Feed & Inventory Reports", exact: true }) });
  await feedGroup.getByRole("link", { name: "Per-animal feed history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Janwar", exact: true })).toBeVisible();
  await go(page, "Reports");

  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
