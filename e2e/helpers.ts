import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { todayPK } from "../src/lib/dates";

export { todayPK };

export function testId(info: TestInfo, prefix: string): string {
  return `${prefix}-${info.project.name}-${info.retry}`;
}

export async function signIn(page: Page): Promise<void> {
  const { email, password } = JSON.parse(readFileSync(resolve("e2e/.local-auth.json"), "utf8")) as { email: string; password: string };
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login karein", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Assalam o Alaikum/ })).toBeVisible();
}

export async function go(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name, exact: true }).first().click();
}

export function section(page: Page, heading: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) }).first();
}

export function moneyValue(text: string): number {
  const match = text.replace(/\u00a0/g, " ").match(/(?:Baqi|Baaki|Aakhir)\s+Rs\s*(-?[\d,]+(?:\.\d{1,2})?)/i);
  if (!match) throw new Error(`No balance in: ${text}`);
  return Number(match[1].replaceAll(",", ""));
}

export async function accountBalance(page: Page, name: string): Promise<number> {
  const card = section(page, "Account ka khulasa").getByRole("button").filter({ hasText: name });
  await expect(card).toBeVisible();
  return moneyValue((await card.textContent()) ?? "");
}
