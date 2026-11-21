import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { signIn, testId, todayPK } from "./helpers";

test("Inventory Report shows ledger balances, usage attribution, filters, and exports", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/inventory/");
  await expect(page.getByRole("heading", { name: "Farm ka Stock", exact: true })).toBeVisible();

  const today = todayPK();
  const itemName = testId(info, "inventory-report-feed");
  await page.getByRole("button", { name: "Samaan add karein", exact: true }).first().click();
  const itemForm = page.locator("form").last();
  await itemForm.getByLabel("Samaan ka naam").fill(itemName);
  await itemForm.locator('select[name="category"]').selectOption({ label: "Janwaron ka chara" });
  await itemForm.locator('select[name="unit"]').selectOption("bag");
  await itemForm.locator('input[name="minimum"]').fill("1");
  await itemForm.locator('input[name="opening"]').fill("3");
  await page.getByRole("button", { name: "Samaan add karein", exact: true }).last().click();
  await expect(page.getByText("Samaan add ho gaya.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stock jari karein", exact: true }).click();
  const usageForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Stock jari / istemal darj karein" }) });
  const itemId = await usageForm.locator('select[name="item"] option').filter({ hasText: itemName }).getAttribute("value");
  expect(itemId).toBeTruthy();
  await usageForm.locator('select[name="item"]').selectOption(itemId!);
  await usageForm.getByLabel("Stock jari karne ki tareekh").fill(today);
  await usageForm.getByLabel("Miktar").fill("1");
  await usageForm.locator('select[name="unit"]').selectOption("bag");
  await usageForm.locator('select[name="staff"]').selectOption("");
  await usageForm.getByLabel("Maqsad").fill("E2E report general farm use");
  await usageForm.getByRole("button", { name: "Stock jari karein" }).click();
  await expect(page.getByText("Stock jari ho gaya. Naya Kharcha ya Galla record nahi bana.", { exact: true })).toBeVisible();

  await page.goto("/reports/inventory/");
  await expect(page.getByRole("heading", { name: "Stock ki Report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yeh hafta", exact: true }).click();
  await expect(page.getByLabel("Stock report shuru ki tareekh")).toHaveValue(addDays(today, -6));
  await expect(page.getByLabel("Stock report aakhir ki tareekh")).toHaveValue(today);
  await page.getByLabel("Samaan").selectOption(itemId!);

  const summary = page.locator("section").filter({ has: page.getByRole("heading", { name: "Har samaan ka stock baqaya" }) });
  const itemRow = summary.getByRole("row").filter({ hasText: itemName });
  await expect(itemRow).toHaveCount(1);
  await expect(itemRow.locator("td").nth(1)).toHaveText("thaila");
  await expect(itemRow.locator("td").nth(2)).toHaveText("0");
  await expect(itemRow.locator("td").nth(3)).toHaveText("3");
  await expect(itemRow.locator("td").nth(5)).toHaveText("1");
  await expect(itemRow.locator("td").nth(9)).toHaveText("2");
  await expect(itemRow.locator("td").nth(11)).toContainText("2 thaila");

  await page.getByLabel("Kis ko diya").selectOption("general");
  const usage = page.locator("section").filter({ has: page.getByRole("heading", { name: "Mulazim ke mutabiq istemal" }) });
  const usageRow = usage.getByRole("row").filter({ hasText: itemName });
  await expect(usageRow).toContainText("Farm ka aam istemal (mulazim ke baghair)");
  await expect(usageRow).toContainText("1 thaila");
  await expect(page.getByText("Istemaal ki qeemat dastiyab nahin: stock dete waqt bharosemand qeemat record nahin hoti.", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Stock ki harkat ki tafseel talash karein" }).fill("E2E report general farm use");
  await expect(itemRow).toHaveCount(1);
  await expect(usageRow).toContainText("1 thaila");
  const movementSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Stock ki harkat" }) });
  await expect(movementSection.getByRole("row").filter({ hasText: itemName })).toContainText("E2E report general farm use");

  const viewportWidth = page.viewportSize()?.width ?? 390;
  if (viewportWidth <= 400) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  }

  for (const [label, extension] of [["PDF hasil karein", "pdf"], ["CSV (Excel mein khol sakte hain)", "csv"], ["Excel file", "xlsx"]] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  }

  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print karein", exact: true }).click();
  await expect(page.getByText("Print ke liye report tayyar hai.", { exact: true })).toBeVisible();
  await expect(page.locator("main").last()).toContainText("Stock ki harkat");
});
