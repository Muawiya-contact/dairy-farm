import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { go, section, signIn, testId, todayPK } from "./helpers";

test("insemination becomes pregnant, then calving creates a tagged calf", async ({ page }, info) => {
  const tag = testId(info, "MOTHER");
  const calf = testId(info, "CALF");
  const today = todayPK();
  await signIn(page);
  await go(page, "Janwar");
  await page.getByRole("button", { name: "Naya" }).click();
  const create = section(page, "Naya janwar");
  await create.getByRole("textbox", { name: "Tag number" }).fill(tag);
  await create.getByRole("combobox", { name: "Aane ka zariya" }).selectOption({ label: "Tohfa" });
  await create.getByLabel("Farm mein aane ki tareekh").fill(addDays(today, -300));
  await create.getByRole("button", { name: "Janwar save karein" }).click();
  await page.getByRole("link").filter({ hasText: tag }).click();

  const breeding = section(page, "Nasl kashi aur bachay ki paidaish");
  const insemination = breeding.getByRole("heading", { name: "Nayi tukhm rezi" }).locator("..");
  await insemination.getByLabel("Tukhm rezi ki tareekh").fill(addDays(today, -280));
  await insemination.getByRole("textbox", { name: "Semen ka naam" }).fill("E2E Bull");
  await insemination.getByRole("button", { name: "Tukhm rezi save karein" }).click();
  await expect(breeding.getByRole("heading", { name: /E2E Bull/ })).toBeVisible();

  await breeding.getByRole("button", { name: "Record badlein" }).click();
  const update = breeding.getByRole("button", { name: "Badla hua record save karein" }).locator("xpath=ancestor::form");
  await update.getByLabel("Ultrasound ki tareekh").fill(addDays(today, -250));
  await update.getByRole("combobox", { name: "Ultrasound ka nateeja" }).selectOption({ label: "Gaabhan" });
  await update.getByRole("combobox", { name: "Haalat" }).selectOption({ label: "Gaabhan" });
  await update.getByRole("button", { name: "Badla hua record save karein" }).click();
  await expect(breeding.getByText("Gaabhan", { exact: true }).first()).toBeVisible();

  const birth = breeding.getByRole("button", { name: "Paidaish aur bachay save karein" }).locator("xpath=ancestor::form");
  const child = birth.getByRole("group", { name: "Bacha 1" });
  await child.getByRole("combobox", { name: /Jins/ }).selectOption({ label: "Mada" });
  await child.getByRole("textbox", { name: "Tag (optional)" }).fill(calf);
  await birth.getByRole("button", { name: "Paidaish aur bachay save karein" }).click();
  const dialog = page.getByRole("dialog", { name: "Paidaish ki tasdeeq" });
  await expect(dialog).toContainText(tag);
  await dialog.getByRole("button", { name: "Paidaish darj karein" }).click();
  await expect(breeding.getByRole("link", { name: `Tag: ${calf}` })).toBeVisible();
  await go(page, "Janwar");
  await page.getByRole("textbox", { name: "Tag ya nasal" }).fill(calf);
  await expect(page.getByRole("link").filter({ hasText: calf })).toBeVisible();
});
