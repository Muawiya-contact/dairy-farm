import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { go, section, signIn, testId } from "./helpers";

test("inactive customer report finds no-purchase customers and exports the filtered rows", async ({ page }, info) => {
  const name = testId(info, "No purchase");
  const phone = info.project.name === "mobile" ? "03001234567" : "03007654321";
  const internationalPhone = `+92${phone.slice(1)}`;
  const localPhoneSearch = `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  await signIn(page);
  await go(page, "Khata");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  const form = section(page, "Naya customer");
  await form.getByRole("textbox", { name: "Naam" }).fill(name);
  await form.getByRole("textbox", { name: "Phone" }).fill(phone);
  await form.getByRole("button", { name: "Customer save karein", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Customer save ho gaya." })).toBeVisible();

  await page.goto("/reports/customer/inactive/");
  await expect(page.getByRole("heading", { name: "Inactive Customers", exact: true })).toBeVisible();
  const customerLink = page.getByRole("link", { name, exact: true });
  await expect(customerLink).toBeVisible();
  await expect(customerLink).toHaveAttribute("href", /\/reports\/customer\/\?id=[^&]+&from=/);
  await expect(customerLink).not.toHaveAttribute("href", /undefined/);

  await page.getByLabel("No-purchase lookback").selectOption("90");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Inactive customer search" }).fill(name);
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText(internationalPhone);
  await page.getByRole("searchbox", { name: "Inactive customer search" }).fill(localPhoneSearch);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("link", { name, exact: true })).toBeVisible();

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF download", exact: true }).click(),
  ]);
  expect(pdf.suggestedFilename().toLowerCase().endsWith(".pdf")).toBe(true);
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe("%PDF-");

  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV download", exact: true }).click(),
  ]);
  expect(csv.suggestedFilename().toLowerCase().endsWith(".csv")).toBe(true);
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Excel download", exact: true }).click(),
  ]);
  expect(xlsx.suggestedFilename().toLowerCase().endsWith(".xlsx")).toBe(true);

  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print karein", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Print ke liye report tayyar hai." })).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 390;
  if (viewportWidth <= 400) await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});
