import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("wrong password is explained in Roman Urdu, then login and logout work", async ({ page }) => {
  const { email, password } = JSON.parse(readFileSync(resolve("e2e/.local-auth.json"), "utf8")) as { email: string; password: string };
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("WrongLocalPassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email ya password ghalat hai." })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Assalam o Alaikum/ })).toBeVisible();
  await page.getByRole("button", { name: "Bahar niklein" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
