import { expect, test } from "@playwright/test";
import { accountBalance, go, section, signIn, testId, todayPK } from "./helpers";

test("a new cow is sold only after confirmation, leaves active list, and credits Galla", async ({ page }, info) => {
  const tag = testId(info, "SALE");
  await signIn(page);
  await go(page, "Galla");
  const bankBefore = await accountBalance(page, "Test bank");
  await go(page, "Janwar");
  await page.getByRole("button", { name: "Naya" }).click();
  const create = section(page, "Naya janwar");
  await create.getByRole("textbox", { name: "Tag number" }).fill(tag);
  await create.getByRole("combobox", { name: "Aane ka zariya" }).selectOption({ label: "Tohfa" });
  await create.getByLabel("Farm mein aane ki tareekh").fill(todayPK());
  await create.getByRole("button", { name: "Janwar save karein" }).click();
  await expect(page.getByRole("link").filter({ hasText: tag })).toBeVisible();
  await page.getByRole("link").filter({ hasText: tag }).click();

  await page.getByRole("button", { name: "Farokht / wafat / doosra" }).click();
  const exit = section(page, "Janwar ka record");
  await exit.getByRole("spinbutton", { name: "Mili hui raqam" }).fill("12345");
  await exit.getByRole("combobox", { name: "Raqam kis account mein aayi" }).selectOption({ label: "Test bank" });
  await exit.getByRole("button", { name: "Farokht darj karein" }).click();
  const dialog = page.getByRole("dialog", { name: "Farokht ki tasdeeq" });
  await expect(dialog).toContainText(tag);
  await expect(page.getByRole("heading", { name: new RegExp(tag) })).toBeVisible();
  await dialog.getByRole("button", { name: "Farokht darj karein" }).click();
  await expect(section(page, "Janwar ka ikhtitam")).toContainText("Farokht");

  await go(page, "Janwar");
  await page.getByRole("textbox", { name: "Tag ya nasal" }).fill(tag);
  await expect(page.getByText("Koi janwar nahi mila.")).toBeVisible();
  await page.getByRole("button", { name: "Farokht", exact: true }).click();
  await expect(page.getByRole("link").filter({ hasText: tag })).toBeVisible();
  await go(page, "Galla");
  await expect.poll(() => accountBalance(page, "Test bank")).toBe(bankBefore + 12345);
});
