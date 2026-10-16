import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { go, section, signIn, testId } from "./helpers";

test("customer payment updates the balance and downloads a real PDF receipt", async ({ page }, info) => {
  const name = testId(info, "Khata test");
  await signIn(page);
  await go(page, "Khata");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  const create = section(page, "Naya customer");
  await create.getByRole("textbox", { name: "Naam" }).fill(name);
  await create.getByRole("spinbutton", { name: "Pichla baqaya" }).fill("500");
  await create.getByRole("button", { name: "Customer save karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Customer save ho gaya." })).toBeVisible();
  await page.getByRole("searchbox", { name: "Customer dhoondein" }).fill(name);
  await page.getByRole("link").filter({ hasText: name }).first().click();
  await expect(page.getByText("Baqi raqam").locator("..")).toContainText("Rs 500");

  const payment = section(page, "Wusooli likhein");
  await payment.getByRole("spinbutton", { name: "Raqam" }).fill("100");
  await payment.getByRole("combobox", { name: "Account" }).selectOption({ label: "Farm galla" });
  await payment.getByRole("button", { name: "Wusooli save karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Wusooli save ho gayi." })).toBeVisible();
  await expect(page.getByText("Baqi raqam").locator("..")).toContainText("Rs 400");

  const receipt = section(page, /ka register/).getByRole("button", { name: "Receipt PDF" });
  const [download] = await Promise.all([page.waitForEvent("download"), receipt.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
