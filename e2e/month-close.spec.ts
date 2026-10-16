import { expect, test } from "@playwright/test";
import { addDays, formatMonth, monthStart } from "../src/lib/dates";
import { go, section, signIn, todayPK } from "./helpers";

test("a closed month rejects milk edits and can reopen only with the typed month", async ({ page }) => {
  await signIn(page);
  const lastDay = addDays(monthStart(todayPK()), -1);
  const month = lastDay.slice(0, 7);
  const name = formatMonth(`${month}-01`);
  await page.goto("/settings/");
  await page.getByRole("button", { name: "Maheena band", exact: true }).click();
  const close = section(page, "Maheena band karein");
  await expect(close.getByText("Band karne se pehle hisaab dekhein")).toBeVisible();
  await close.getByRole("checkbox", { name: "Maine is maheene ka hisaab dekh liya hai." }).check();
  await close.getByRole("button", { name: "Maheena band karein" }).click();
  await expect(close.getByRole("status").filter({ hasText: "Maheena band ho gaya." })).toBeVisible();

  await go(page, "Doodh");
  await page.getByLabel("Tareekh", { exact: true }).fill(lastDay);
  await page.getByRole("spinbutton", { name: "Kul doodh" }).fill("200");
  await page.getByRole("button", { name: "Entry save karein" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Yeh maheena band hai." })).toBeVisible();

  await page.goto("/settings/");
  await expect(page.getByRole("button", { name: "Maheena band", exact: true })).toHaveAttribute("aria-expanded", "true");
  const reopen = section(page, "Maheena band karein");
  await expect(reopen.getByText(`${name}: Band`, { exact: false })).toBeVisible();
  await reopen.getByRole("textbox", { name: "Dobara kholne ki wajah" }).fill("E2E month test finished");
  const confirm = reopen.getByRole("textbox", { name: `Tasdeeq ke liye ${name} likhein` });
  await confirm.fill("Wrong month");
  await expect(reopen.getByRole("button", { name: "Maheena dobara kholein" })).toBeDisabled();
  await confirm.fill(name);
  await reopen.getByRole("button", { name: "Maheena dobara kholein" }).click();
  await expect(reopen.getByRole("status").filter({ hasText: "Maheena dobara khul gaya." })).toBeVisible();
});
