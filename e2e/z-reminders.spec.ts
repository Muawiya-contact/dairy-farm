import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
import { go, section, signIn, testId, todayPK } from "./helpers";

test("ultrasound reminder dismisses for today and an empty result offers a new AI form", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One disposable database is shared by both viewport projects.");
  const tag = testId(info, "REMINDER");
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
  const ai = breeding.getByRole("heading", { name: "Nayi tukhm rezi" }).locator("..");
  await ai.getByLabel("Tukhm rezi ki tareekh").fill(addDays(today, -33));
  await ai.getByRole("button", { name: "Tukhm rezi save karein" }).click();

  const banner = page.getByRole("status").filter({ hasText: "Aaj ke kaam:" });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: /yaad-dihaniyan/ }).click();
  await expect(page.getByRole("region", { name: "Nasl aur sehat ki yaad-dihaniyan" })).toContainText(`${tag}: ultrasound — 2 din baad`);
  await page.getByRole("button", { name: /yaad-dihaniyan/ }).click();
  await banner.getByRole("button", { name: "Theek hai" }).click();
  await page.reload();
  await expect(banner).toHaveCount(0);

  await breeding.getByRole("button", { name: "Record badlein" }).click();
  const update = breeding.getByRole("button", { name: "Badla hua record save karein" }).locator("xpath=ancestor::form");
  await update.getByLabel("Ultrasound ki tareekh").fill(today);
  await update.getByRole("combobox", { name: "Ultrasound ka nateeja" }).selectOption({ label: "Khali" });
  await update.getByRole("combobox", { name: "Haalat" }).selectOption({ label: "Khali" });
  await update.getByRole("button", { name: "Badla hua record save karein" }).click();
  await expect(breeding.getByRole("button", { name: "Nayi tukhm rezi darj karein" })).toBeVisible();
  await breeding.getByRole("button", { name: "Nayi tukhm rezi darj karein" }).click();
  await expect(breeding.getByRole("heading", { name: "Nayi tukhm rezi" }).locator("..").getByLabel("Tukhm rezi ki tareekh")).toHaveValue(today);
});
