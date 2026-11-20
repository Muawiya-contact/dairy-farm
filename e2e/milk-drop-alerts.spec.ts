import { expect, test } from "@playwright/test";
import { go, section, signIn, testId, todayPK } from "./helpers";

test("shows a shift-specific production drop in the reminder bell and dismisses it without milk writes", async ({ page }, info) => {
  let alertAnimalId = "00000000-0000-4000-8000-000000000001";
  const writes: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    const milkWrite = path.endsWith("/animal_milk") || path.endsWith("/milk_shifts")
      || path.endsWith("/rpc/save_milk_entry_with_dispositions")
      || path.endsWith("/rpc/correct_milk_entry_with_dispositions");
    if (milkWrite && request.method() !== "GET") writes.push(`${request.method()} ${path}`);
  });
  await page.route("**/rest/v1/rpc/herd_alerts*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{
      alert_kind: "milk_drop_morning", severity: "today", due_date: todayPK(), animal_id: alertAnimalId,
      tag: "MILK-DROP-QA", message: "MILK-DROP-QA: subah ka doodh 7 din ke ausat se kam — ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam",
      days_left: 0,
    }]),
  }));

  await signIn(page);
  const banner = page.getByRole("status").filter({ hasText: "Aaj ke kaam" });
  await expect(banner).toContainText("1 aaj");
  await banner.getByRole("button", { name: "Dekhein" }).click();
  await expect(page.getByRole("region", { name: "Nasl aur sehat ki yaad-dihaniyan" }))
    .toContainText("ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam");

  await page.getByRole("button", { name: "1 yaad-dihaniyan" }).click();
  await banner.getByRole("button", { name: "Theek hai" }).click();
  await expect(banner).toHaveCount(0);
  expect(writes).toEqual([]);

  const tag = testId(info, "MILK-DROP-PROFILE");
  await go(page, "Janwar");
  await page.getByRole("button", { name: "Naya" }).click();
  const create = section(page, "Naya janwar");
  await create.getByRole("textbox", { name: "Tag number" }).fill(tag);
  await create.getByLabel("Farm mein aane ki tareekh").fill(todayPK());
  await create.getByLabel("Milk status").selectOption("milking");
  await create.getByRole("button", { name: "Janwar save karein" }).click();
  const animalLink = page.getByRole("link").filter({ hasText: tag });
  await expect(animalLink).toBeVisible();
  const href = await animalLink.getAttribute("href");
  alertAnimalId = new URL(href!, page.url()).searchParams.get("id")!;
  await animalLink.click();
  await expect(section(page, "Aik nazar mein")).toContainText("ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam");
});
