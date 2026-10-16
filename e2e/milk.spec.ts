import { expect, test } from "@playwright/test";
import { accountBalance, go, section, signIn } from "./helpers";

const heroMilk = async (page: import("@playwright/test").Page) => {
  const text = (await page.getByText("Aaj ka doodh", { exact: true }).locator("..").textContent()) ?? "";
  const match = text.match(/Aaj ka doodh\s*([\d,.]+)\s*litre/);
  if (!match) throw new Error(`Today's milk is missing: ${text}`);
  return Number(match[1].replaceAll(",", ""));
};

test("a Naqd shift refreshes Home, Khata and Galla through client navigation", async ({ page }, info) => {
  await signIn(page);
  const beforeMilk = await heroMilk(page);
  await page.evaluate(() => { (window as Window & { e2eNavigationMarker?: string }).e2eNavigationMarker = "kept"; });
  await go(page, "Galla");
  const beforeCash = await accountBalance(page, "Farm galla");
  await go(page, "Doodh");
  const morning = info.project.name === "mobile";
  await page.getByRole("tab", { name: morning ? "Subah" : "Shaam" }).click();
  if (morning) {
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      screen: window.screen.width,
      scroll: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.getBoundingClientRect().right > 361)
        .reverse().slice(0, 15)
        .map((element) => ({ tag: element.tagName, className: element.className, width: Math.round(element.getBoundingClientRect().width), right: Math.round(element.getBoundingClientRect().right) })),
    }));
    expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(360);
  }
  await page.getByRole("spinbutton", { name: "Kul doodh" }).fill("200");
  await expect(page.getByRole("spinbutton", { name: "Naqd litres" })).toHaveValue(morning ? "3" : "2");
  await page.getByRole("button", { name: "Entry save karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Entry farm ke data mein save ho gayi." })).toBeVisible();

  await go(page, "Home");
  await expect.poll(() => heroMilk(page)).toBe(beforeMilk + 200);
  await go(page, "Khata");
  await page.getByRole("searchbox", { name: "Customer dhoondein" }).fill("Naqd");
  await page.getByRole("link").filter({ hasText: "Naqd" }).first().click();
  const register = section(page, /ka register/);
  await expect(register).toContainText(morning ? "Subah doodh" : "Shaam doodh");
  await expect(register).toContainText("Wusooli");
  await expect(register).toContainText(morning ? "Rs 450" : "Rs 300");

  await go(page, "Galla");
  await expect.poll(() => accountBalance(page, "Farm galla")).toBe(beforeCash + (morning ? 450 : 300));
  expect(await page.evaluate(() => (window as Window & { e2eNavigationMarker?: string }).e2eNavigationMarker)).toBe("kept");
});
