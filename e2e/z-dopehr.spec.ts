import { expect, test } from "@playwright/test";
import { go, section, signIn, testId } from "./helpers";

async function openMilkSettings(page: import("@playwright/test").Page) {
  const section = page.getByRole("button", { name: "Doodh ke auqaat" });
  if (await section.getAttribute("aria-expanded") !== "true") await section.click();
}

test("Dopehr toggle, customer default, milk can and bill stay in sync", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This final flow runs after the shared milk specs in the desktop project.");
  const customer = testId(info, "Dopehr buyer");
  await signIn(page);
  await page.goto("/settings/");
  await openMilkSettings(page);
  const toggle = page.getByRole("checkbox", { name: /Dopehr ka doodh/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await go(page, "Doodh");
  await expect(page.getByRole("tab", { name: "Dopehr" })).toHaveCount(0);

  await page.goto("/settings/");
  await openMilkSettings(page);
  await toggle.check();
  await expect(toggle).toBeChecked();
  await go(page, "Khata");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  const create = section(page, "Naya customer");
  await create.getByRole("textbox", { name: "Naam" }).fill(customer);
  await create.getByRole("spinbutton", { name: "Dopehr litres" }).fill("2");
  await create.getByRole("button", { name: "Customer save karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Customer save ho gaya." })).toBeVisible();

  await go(page, "Doodh");
  await expect(page.getByRole("tab", { name: "Dopehr" })).toBeVisible();
  for (const shift of ["Subah", "Dopehr", "Shaam"]) {
    await page.getByRole("tab", { name: shift }).click();
    await page.getByRole("spinbutton", { name: "Kul doodh" }).fill("200");
    if (shift === "Dopehr") await expect(page.getByRole("spinbutton", { name: `${customer} litres` })).toHaveValue("2");
    await page.getByRole("button", { name: "Entry save karein" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Entry farm ke data mein save ho gayi." })).toBeVisible();
  }
  await go(page, "Home");
  const drum = page.getByRole("img", { name: /Doodh ka drum/ });
  await expect(drum).toContainText("Dopehr 200 L");
  await expect(drum.locator('[class*="#a9cfe6"]').first()).toBeVisible();
  await go(page, "Khata");
  await page.getByRole("searchbox", { name: "Customer dhoondein" }).fill(customer);
  await page.getByRole("link").filter({ hasText: customer }).first().click();
  await expect(section(page, /ka register/)).toContainText("Dopehr doodh");
});
