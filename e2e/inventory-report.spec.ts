import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { signIn, testId, todayPK } from "./helpers";

test("Inventory Report shows ledger balances, usage attribution, filters, and exports", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/inventory/");
  await expect(page.getByRole("heading", { name: "Farm Inventory", exact: true })).toBeVisible();

  const today = todayPK();
  const itemName = testId(info, "inventory-report-feed");
  await page.getByRole("button", { name: "Add item", exact: true }).first().click();
  const itemForm = page.locator("form").last();
  await itemForm.getByLabel("Item name").fill(itemName);
  await itemForm.locator('select[name="category"]').selectOption({ label: "Animal feed & fodder" });
  await itemForm.locator('select[name="unit"]').selectOption("bag");
  await itemForm.locator('input[name="minimum"]').fill("1");
  await itemForm.locator('input[name="opening"]').fill("3");
  await page.getByRole("button", { name: "Add item", exact: true }).last().click();
  await expect(page.getByText("Inventory item added.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Issue stock", exact: true }).click();
  const usageForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Issue stock / record usage" }) });
  const itemId = await usageForm.locator('select[name="item"] option').filter({ hasText: itemName }).getAttribute("value");
  expect(itemId).toBeTruthy();
  await usageForm.locator('select[name="item"]').selectOption(itemId!);
  await usageForm.getByLabel("Issue date").fill(today);
  await usageForm.getByLabel("Quantity").fill("1");
  await usageForm.locator('select[name="unit"]').selectOption("bag");
  await usageForm.locator('select[name="staff"]').selectOption("");
  await usageForm.getByLabel("Purpose").fill("E2E report general farm use");
  await usageForm.getByRole("button", { name: "Save stock issue" }).click();
  await expect(page.getByText("Stock issue saved. No new Kharcha or Galla entry was created.", { exact: true })).toBeVisible();

  await page.goto("/reports/inventory/");
  await expect(page.getByRole("heading", { name: "Inventory Report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(page.getByLabel("Inventory report from date")).toHaveValue(addDays(today, -6));
  await expect(page.getByLabel("Inventory report through date")).toHaveValue(today);
  await page.getByLabel("Inventory item").selectOption(itemId!);

  const summary = page.locator("section").filter({ has: page.getByRole("heading", { name: "Item-wise stock balances" }) });
  const itemRow = summary.getByRole("row").filter({ hasText: itemName });
  await expect(itemRow).toHaveCount(1);
  await expect(itemRow.locator("td").nth(1)).toHaveText("bag");
  await expect(itemRow.locator("td").nth(2)).toHaveText("0");
  await expect(itemRow.locator("td").nth(3)).toHaveText("3");
  await expect(itemRow.locator("td").nth(5)).toHaveText("1");
  await expect(itemRow.locator("td").nth(9)).toHaveText("2");
  await expect(itemRow.locator("td").nth(11)).toContainText("2 bag");

  await page.getByLabel("Issued to").selectOption("general");
  const usage = page.locator("section").filter({ has: page.getByRole("heading", { name: "Employee-wise usage" }) });
  const usageRow = usage.getByRole("row").filter({ hasText: itemName });
  await expect(usageRow).toContainText("General farm use (unassigned)");
  await expect(usageRow).toContainText("1 bag");
  await expect(page.getByText("Usage value is unavailable: stock issues do not record a reliable cost basis.", { exact: true })).toBeVisible();

  const viewportWidth = page.viewportSize()?.width ?? 390;
  if (viewportWidth <= 400) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  }

  for (const [label, extension] of [["PDF download", "pdf"], ["CSV (Excel compatible)", "csv"], ["Excel workbook", "xlsx"]] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  }

  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByText("Print view is ready.", { exact: true })).toBeVisible();
  await expect(page.locator("main").last()).toContainText("Dated movements");
});
