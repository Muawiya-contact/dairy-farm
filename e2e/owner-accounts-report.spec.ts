import { expect, test, type Page } from "@playwright/test";
import { accountBalance, go, section, signIn } from "./helpers";

async function ownerBalance(page: Page): Promise<number> {
  const account = section(page, "Account ka khulasa").getByRole("button").filter({ hasText: "Demo Owner" });
  await expect(account).toBeVisible();
  const text = (await account.textContent()) ?? "";
  const hasFarmMoney = text.match(/ke paas farm ke Rs\s*(-?[\d,]+(?:\.\d{1,2})?)/);
  const owesFarm = text.match(/ne farm par Rs\s*(-?[\d,]+(?:\.\d{1,2})?)/);
  const value = Number((hasFarmMoney?.[1] ?? owesFarm?.[1] ?? "0").replaceAll(",", ""));
  return hasFarmMoney ? value : -value;
}

test("records both owner movements once and shows them in Galla and Accounts Report", async ({ page }, testInfo) => {
  await signIn(page);
  await go(page, "Galla");

  const owner = section(page, "Owner deposit ya withdrawal");
  await expect(owner.getByRole("combobox", { name: "Owner account" }).locator("option")).toHaveText([
    "Owner account chunein", "Demo Owner",
  ]);
  const cashBefore = await accountBalance(page, "Farm galla");
  const ownerBefore = await ownerBalance(page);
  const viewportWidth = page.viewportSize()?.width ?? 1366;
  if (viewportWidth <= 400) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  const withdrawalNote = `Owner withdrawal ${testInfo.project.name}`;
  await owner.getByRole("combobox", { name: "Owner account" }).selectOption({ label: "Demo Owner" });
  await owner.getByRole("spinbutton", { name: "Owner transaction raqam" }).fill("125");
  const note = owner.getByRole("textbox", { name: "Owner transaction note" });
  await expect(note).toHaveAttribute("required", "");
  await note.fill(withdrawalNote);
  await owner.getByRole("button", { name: "Withdrawal darj karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Owner ki withdrawal Farm Galla mein darj ho gayi." })).toBeVisible();
  await expect.poll(() => accountBalance(page, "Farm galla")).toBe(cashBefore - 125);
  await expect.poll(() => ownerBalance(page)).toBe(ownerBefore + 125);

  const depositNote = `Owner deposit ${testInfo.project.name}`;
  await owner.getByRole("radio", { name: "Owner ne farm mein paisay jama karwaye" }).check();
  await owner.getByRole("combobox", { name: "Owner account" }).selectOption({ label: "Demo Owner" });
  await owner.getByRole("spinbutton", { name: "Owner transaction raqam" }).fill("50");
  await owner.getByRole("textbox", { name: "Owner transaction note" }).fill(depositNote);
  await owner.getByRole("button", { name: "Deposit darj karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Owner ka deposit Farm Galla mein darj ho gaya." })).toBeVisible();
  await expect.poll(() => accountBalance(page, "Farm galla")).toBe(cashBefore - 75);
  await expect.poll(() => ownerBalance(page)).toBe(ownerBefore + 75);

  const dailyClosing = section(page, "Rozana closing aur Farm cash position");
  await expect(dailyClosing.getByText("Hisaab ke mutabiq closing")).toBeVisible();
  await expect(dailyClosing.getByText("Owner withdrawals")).toBeVisible();
  await expect(dailyClosing.getByText("Owner deposits")).toBeVisible();

  await go(page, "Reports");
  await go(page, "Accounts Report");
  await page.getByRole("button", { name: "Aaj", exact: true }).click();
  const withdrawalTable = page.locator("section").filter({ has: page.getByRole("heading", { name: /Owner withdrawals ·/ }) }).first();
  const depositTable = page.locator("section").filter({ has: page.getByRole("heading", { name: /Owner deposits ·/ }) }).first();
  await expect(withdrawalTable.getByText(withdrawalNote, { exact: true })).toHaveCount(1);
  await expect(depositTable.getByText(depositNote, { exact: true })).toHaveCount(1);
  await expect(withdrawalTable.getByRole("row").filter({ hasText: withdrawalNote })).toContainText("User ID:");
  await expect(depositTable.getByRole("row").filter({ hasText: depositNote })).toContainText("User ID:");

  await page.getByRole("button", { name: "Sab record" }).click();
  await expect(page.getByText("Darj nahi").first()).toBeVisible();
  for (const format of ["PDF", "Excel", "CSV"] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: `${format} download` }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format === "Excel" ? "xlsx" : format.toLowerCase()}$`));
  }

  if (viewportWidth <= 400) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
