import { expect, test } from "@playwright/test";
import { addDays, formatDay } from "../src/lib/dates";
import { go, section, signIn, testId, todayPK } from "./helpers";

test("manual breeding dates and care reminders survive dismissal until completed", async ({ page }, info) => {
  const tag = testId(info, "CARE-COW");
  const today = todayPK();
  const manualUltrasound = addDays(today, 3);
  const manualCalving = addDays(today, 40);
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
  await insemination.getByRole("textbox", { name: "Semen ka naam" }).fill("Care reminder test");
  await insemination.getByRole("button", { name: "Tukhm rezi save karein" }).click();
  await expect(breeding.getByRole("heading", { name: /Care reminder test/ })).toBeVisible();
  await breeding.getByRole("button", { name: "Record badlein" }).click();
  const update = breeding.getByRole("button", { name: "Badla hua record save karein" }).locator("xpath=ancestor::form");
  await update.getByLabel("Ultrasound ki due tareekh (manual)").fill(manualUltrasound);
  await update.getByLabel("Paidaish ki mutawaqqa tareekh (manual)").fill(manualCalving);
  await update.getByRole("button", { name: "Badla hua record save karein" }).click();
  await expect(breeding).toContainText("khud set");
  await expect(section(page, "Janwar ki maloomat")).toContainText(formatDay(manualCalving));

  const care = section(page, "Janwar ke yaad-dihani");
  await care.getByLabel("Qism").selectOption("vaccination");
  await care.getByLabel("Task ka naam").fill("E2E FMD vaccine");
  await care.getByLabel("Due tareekh").fill(today);
  await care.getByRole("button", { name: "Yaad-dihani save" }).click();
  await expect(care.getByRole("heading", { name: "Khulay tasks (1)" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Aaj ke kaam");
  await page.getByRole("button", { name: "Theek hai" }).click();
  await page.reload();
  const reloadedCare = section(page, "Janwar ke yaad-dihani");
  await expect(reloadedCare.getByText("E2E FMD vaccine")).toBeVisible();
  await expect(reloadedCare.getByRole("button", { name: "Mukammal karein" })).toBeVisible();

  await reloadedCare.getByRole("button", { name: "Mukammal karein" }).click();
  await reloadedCare.getByLabel("Mukammal hone ka note").fill("Vet visit complete");
  await reloadedCare.getByRole("button", { name: "Task mukammal save karein" }).click();
  await expect(reloadedCare.getByRole("heading", { name: "Khulay tasks (0)" })).toBeVisible();
  await expect(reloadedCare.getByLabel("Mukammal yaad-dihani tasks")).toContainText("Vet visit complete");
});
