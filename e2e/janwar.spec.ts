import { expect, test } from "@playwright/test";
import { addDays } from "../src/lib/dates";
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

  const health = section(page, "Sehat aur vet history");
  const healthForm = health.getByRole("heading", { name: "Nayi health ya vaccine entry" }).locator("xpath=ancestor::form");
  await healthForm.getByLabel("Entry ka naam").fill("E2E hoof treatment");
  await healthForm.getByLabel("Health record type").selectOption("treatment");
  await healthForm.getByLabel("Tareekh", { exact: true }).fill(todayPK());
  await healthForm.getByLabel("Symptoms / nishaniyan").fill("Limping after a walk");
  await healthForm.getByLabel("Vet ki likhi tashkhees").fill("Vet-entered hoof injury");
  await healthForm.getByLabel("Shiddat (optional)").selectOption("moderate");
  await healthForm.getByLabel("Maujooda haalat").fill("Recovering");
  await healthForm.getByLabel("Medicine / vaccine product").fill("E2E hoof medicine");
  await healthForm.getByLabel("Medicine ki qisam").fill("Topical");
  await healthForm.getByLabel("Dose").fill("Recorded from vet note");
  await healthForm.getByLabel("Dene ka tareeqa").fill("Topical application");
  await healthForm.getByLabel("Treatment start").fill(todayPK());
  await healthForm.getByLabel("Treatment end").fill(addDays(todayPK(), 2));
  await healthForm.getByLabel("Veterinarian").fill("E2E vet");
  await healthForm.getByLabel("Agli due tareekh").fill(addDays(todayPK(), 2));
  await healthForm.getByLabel("Notes").fill("Owner-entered E2E note");
  await healthForm.getByRole("button", { name: "Health entry save" }).click();
  const healthEntry = health.locator("ol > li").filter({ hasText: "E2E hoof treatment" });
  await expect(healthEntry).toContainText("Limping after a walk");
  await expect(healthEntry).toContainText("Vet-entered hoof injury");
  await expect(healthEntry).toContainText("E2E hoof medicine");
  await expect(healthEntry).toContainText("Recorded from vet note");
  await expect(healthEntry).toContainText("Agli due tareekh");
  await expect(health).toContainText("Recorded medical total: Rs 0");

  const attachmentInput = healthEntry.getByLabel("File jorein");
  await attachmentInput.setInputFiles({ name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
  await healthEntry.getByRole("button", { name: "Private file upload" }).click();
  await expect(healthEntry.getByRole("status")).toContainText("PDF, JPEG ya PNG");
  const reportPdf = Buffer.from("%PDF-1.4\nE2E veterinary report\n%%EOF\n");
  await attachmentInput.setInputFiles({ name: "vet-report.pdf", mimeType: "application/pdf", buffer: reportPdf });
  await healthEntry.getByRole("button", { name: "Private file upload" }).click();
  await expect(healthEntry.getByText("vet-report.pdf")).toBeVisible();
  await healthEntry.getByRole("button", { name: "Private file dekhein" }).click();
  const privateFileLink = healthEntry.getByRole("link", { name: "File download karein" });
  await expect(privateFileLink).toBeVisible();
  await expect(privateFileLink).toHaveAttribute("href", /\/object\/sign\/health-records\//);

  await healthForm.getByLabel("Entry ka naam").fill("E2E FMD vaccine");
  await healthForm.getByLabel("Health record type").selectOption("vaccine");
  await healthForm.getByLabel("Tareekh", { exact: true }).fill(todayPK());
  await healthForm.getByLabel("Medicine / vaccine product").fill("E2E FMD batch");
  await healthForm.getByLabel("Dose").fill("Recorded from vaccine note");
  await healthForm.getByLabel("Veterinarian").fill("E2E vet");
  await healthForm.getByLabel("Agli due tareekh").fill(addDays(todayPK(), 2));
  await healthForm.getByRole("button", { name: "Health entry save" }).click();
  await health.getByRole("button", { name: "Vaccines" }).click();
  await expect(health.locator("ol")).toContainText("E2E FMD vaccine");
  await expect(health.locator("ol")).not.toContainText("E2E hoof treatment");
  await page.getByRole("button", { name: /yaad-dihaniyan/ }).click();
  await expect(page.getByRole("region", { name: "Nasl aur sehat ki yaad-dihaniyan" })).toContainText(`${tag}: E2E FMD vaccine — 2 din baad`);
  await page.getByRole("button", { name: /yaad-dihaniyan/ }).click();

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
  await expect(page.getByText("Paidaish ka record nahi.")).toBeVisible();
  await expect(photo.getByLabel("Tasveer upload karein")).toBeHidden();
  await expect(page.getByRole("button", { name: "PDF download karein" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});
