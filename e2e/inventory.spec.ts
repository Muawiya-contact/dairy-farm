import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { signIn, testId, todayPK } from "./helpers";

test("Farm Inventory creates a unit-aware item, posts stock movements, and filters its history", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/inventory/");
  await expect(page.getByRole("heading", { name: "Farm Inventory", exact: true })).toBeVisible();

  const today = todayPK();
  const itemName = testId(info, "inventory-feed");
  await page.getByRole("button", { name: "Add item", exact: true }).first().click();
  const itemForm = page.locator("form").last();
  await itemForm.getByLabel("Item name").fill(itemName);
  await itemForm.locator('select[name="category"]').selectOption({ label: "Animal feed & fodder" });
  await itemForm.locator('select[name="unit"]').selectOption("bag");
  await itemForm.locator('input[name="minimum"]').fill("3");
  await itemForm.locator('input[name="opening"]').fill("0");
  await page.getByRole("button", { name: "Add item", exact: true }).last().click();
  await expect(page.getByText("Inventory item added.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stock in", exact: true }).click();
  const purchaseForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Purchase / stock in" }) });
  const itemSelect = purchaseForm.locator('select[name="item"]');
  const itemId = await itemSelect.locator("option").filter({ hasText: itemName }).getAttribute("value");
  expect(itemId).toBeTruthy();
  await itemSelect.selectOption(itemId!);
  await expect(purchaseForm.locator('select[name="unit"]')).toHaveValue("bag");
  await purchaseForm.getByLabel("Purchase date").fill(today);
  await purchaseForm.getByLabel("Quantity").fill("2");
  await purchaseForm.getByLabel("Rate per selected unit (Rs)").fill("100");
  await purchaseForm.getByLabel("Total paid (Rs)").fill("200");
  await purchaseForm.getByLabel("Paid from Galla account").selectOption({ index: 1 });
  await purchaseForm.getByLabel("Kharcha category").selectOption({ index: 1 });
  await purchaseForm.getByLabel("Supplier (optional)").fill("E2E QA supplier");
  await purchaseForm.getByLabel("Invoice / reference (optional)").fill(itemName);
  await purchaseForm.getByLabel("Batch code (optional)").fill("E2E-BATCH-1");
  await purchaseForm.getByLabel("Expiry date (optional)").fill(addDays(today, 30));
  await purchaseForm.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Purchase saved to stock, Kharcha, and the selected Galla account.", { exact: true })).toBeVisible();
  await expect(page.getByText("2 bag", { exact: true })).toBeVisible();
  await expect(page.getByText("Low stock", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Issue stock", exact: true }).click();
  const usageForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Issue stock / record usage" }) });
  await usageForm.locator('select[name="item"]').selectOption(itemId!);
  await expect(usageForm.locator('select[name="unit"]')).toHaveValue("bag");
  await usageForm.getByLabel("Issue date").fill(today);
  await usageForm.getByLabel("Quantity").fill("3");
  await usageForm.getByLabel("Purpose").fill("E2E stock guard");
  await usageForm.getByRole("button", { name: "Save stock issue" }).click();
  await expect(page.getByRole("alert")).toContainText("This movement would make stock negative.");
  await expect(page.getByText("2 bag", { exact: true })).toBeVisible();

  await usageForm.getByLabel("Quantity").fill("1");
  await usageForm.getByRole("button", { name: "Save stock issue" }).click();
  await expect(page.getByText("Stock issue saved. No new Kharcha or Galla entry was created.", { exact: true })).toBeVisible();
  await expect(page.getByText("1 bag", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Adjust stock", exact: true }).click();
  const adjustmentForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Stock adjustment / wastage" }) });
  await adjustmentForm.locator('select[name="item"]').selectOption(itemId!);
  await expect(adjustmentForm.locator('select[name="unit"]')).toHaveValue("bag");
  await adjustmentForm.getByLabel("Date").fill(today);
  await adjustmentForm.getByLabel("Direction").selectOption("1");
  await adjustmentForm.getByLabel("Quantity").fill("1");
  await adjustmentForm.getByLabel("Reason (required)").fill("E2E physical count");
  await adjustmentForm.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText("Stock adjustment saved with its reason and audit history.", { exact: true })).toBeVisible();
  await expect(page.getByText("2 bag", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(itemName) }).first().click();
  const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Item movement history" }) });
  await expect(history).toBeVisible();
  await expect(history.getByText("Purchase", { exact: true })).toBeVisible();
  await expect(history.getByText("Usage / issue", { exact: true })).toBeVisible();
  await expect(history.getByText("Adjustment", { exact: true })).toBeVisible();
  await expect(history.getByText("E2E-BATCH-1", { exact: true })).toBeVisible();
  await expect(history.getByText(/linked to Kharcha/)).toBeVisible();
  await history.getByLabel("From").fill(today);
  await history.getByLabel("Through").fill(today);
  await expect(history.getByText("Purchase", { exact: true })).toBeVisible();
  await history.getByLabel("From").fill(addDays(today, -1));
  await history.getByLabel("Through").fill(addDays(today, -1));
  await expect(history.getByText("No movements in this date range.", { exact: true })).toBeVisible();
  await expect(history.getByText("Current available: 2 bag", { exact: true })).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 360;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
