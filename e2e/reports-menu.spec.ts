import { expect, test } from "@playwright/test";
import { go, signIn } from "./helpers";

test("Reports menu groups all nine categories and routes each group to its existing report", async ({ page }) => {
  await signIn(page);
  await go(page, "Reports");

  const menu = page.getByRole("navigation", { name: "Report categories" });
  await expect(menu.locator("section")).toHaveCount(9);
  await expect(menu.getByRole("link")).toHaveCount(19);
  const destinations = [
    ["Customer Reports", "Customer Report", "Customer Report"],
    ["Customer Reports", "Inactive Customers", "Inactive Customers"],
    ["Milk Reports", "Milk Report", "Milk Report"],
    ["Purchase Reports", "Stock ki Report", "Stock ki Report"],
    ["Sales Reports", "Milk Report", "Milk Report"],
    ["Accounts Reports", "Accounts Report", "Accounts Report"],
    ["Financial Reports", "Maali Report", "Maali Report"],
    ["Animal Reports", "Animal Report", "Animal Report"],
    ["Feed & Inventory Reports", "Stock ki Report", "Stock ki Report"],
    ["Farm Analytics", "Final Report", "Final Report"],
  ] as const;

  for (const [groupName, reportLink, heading] of destinations) {
    const group = menu.locator("section").filter({ has: page.getByRole("heading", { name: groupName, exact: true }) });
    await group.getByRole("link", { name: reportLink, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Wapas", exact: true }).click();
    if (reportLink === "Inactive Customers") {
      await expect(page.getByRole("heading", { name: "Customer Report", exact: true })).toBeVisible();
      await go(page, "Reports");
    }
    await expect(menu.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
  }

  const feedGroup = menu.locator("section").filter({ has: page.getByRole("heading", { name: "Feed & Inventory Reports", exact: true }) });
  await feedGroup.getByRole("link", { name: "Per-animal feed history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Janwar", exact: true })).toBeVisible();
  await go(page, "Reports");

  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
