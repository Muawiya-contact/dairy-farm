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
  await page.getByPlaceholder("Tag ya nasal").fill(tag);
  await expect(page.getByText("Koi janwar nahi mila.")).toBeVisible();
  await page.getByRole("button", { name: "Farokht", exact: true }).click();
  await expect(page.getByRole("link").filter({ hasText: tag })).toBeVisible();
  await go(page, "Galla");
  await expect.poll(() => accountBalance(page, "Test bank")).toBe(bankBefore + 12345);
});

test("animal profile keeps statuses independent, manages private photos, and exports a print-ready dossier", async ({ page }, info) => {
  const tag = testId(info, "PROFILE");
  await signIn(page);
  await go(page, "Janwar");
  await page.getByRole("button", { name: "Naya" }).click();
  const create = section(page, "Naya janwar");
  await create.getByRole("textbox", { name: "Tag number" }).fill(tag);
  await create.getByLabel("Farm mein aane ki tareekh").fill(todayPK());
  await create.getByRole("textbox", { name: "Bechne wala" }).fill("E2E seller");
  await create.getByRole("textbox", { name: "Mandi / khareed ki jagah" }).fill("E2E market");
  await create.getByRole("button", { name: "Janwar save karein" }).click();
  const animalLink = page.getByRole("link").filter({ hasText: tag });
  await expect(animalLink).toBeVisible();
  await animalLink.click();

  const profile = section(page, "Janwar ki maloomat");
  await expect(profile).toContainText("Farm mein haisiyat");
  await expect(profile).toContainText("Doodh ki haisiyat");
  await expect(profile).toContainText("Nasl kashi ki haisiyat");
  await expect(profile).toContainText("Sehat ka agla kaam");
  await expect(profile).toContainText("E2E seller");
  await expect(profile).toContainText("E2E market");

  const photo = section(page, "Janwar ki tasveer");
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
  const picker = photo.getByLabel("Tasveer upload karein");
  await picker.setInputFiles({ name: "cow.png", mimeType: "image/png", buffer: tinyPng });
  await expect(photo.getByRole("img", { name: `${tag} ki tasveer` })).toBeVisible();
  await picker.setInputFiles({ name: "cow-replacement.png", mimeType: "image/png", buffer: tinyPng });
  await expect(photo.getByText("Photo save ho gayi.")).toBeVisible();

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF download karein" }).click();
  expect((await pdfDownload).suggestedFilename()).toBe(`animal-${tag}.pdf`);
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel download karein" }).click();
  expect((await excelDownload).suggestedFilename()).toBe(`animal-${tag}.xlsx`);

  page.once("dialog", (dialog) => dialog.accept());
  await photo.getByRole("button", { name: "Tasveer hata dein" }).click();
  await expect(photo.getByText("Tasveer nahi")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Record ki tafseel" })).toBeVisible();
  await expect(photo.getByLabel("Tasveer upload karein")).toBeHidden();
  await expect(page.getByRole("button", { name: "PDF download karein" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});
