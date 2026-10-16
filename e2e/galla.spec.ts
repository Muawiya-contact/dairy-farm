import { expect, test } from "@playwright/test";
import { accountBalance, go, section, signIn } from "./helpers";

test("a Rs 1000 transfer changes both accounts once and cash difference needs a reason", async ({ page }) => {
  await signIn(page);
  await go(page, "Galla");
  const farmBefore = await accountBalance(page, "Farm galla");
  const bankBefore = await accountBalance(page, "Test bank");
  const transfer = section(page, "Account se account transfer");
  await transfer.getByRole("combobox", { name: "Kis account se" }).selectOption({ label: "Farm galla" });
  await transfer.getByRole("combobox", { name: "Kis account mein" }).selectOption({ label: "Test bank" });
  await transfer.getByRole("spinbutton", { name: "Transfer raqam" }).fill("1000");
  await transfer.getByRole("button", { name: "Transfer save karein" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Transfer save ho gaya." })).toBeVisible();
  await expect.poll(() => accountBalance(page, "Farm galla")).toBe(farmBefore - 1000);
  await expect.poll(() => accountBalance(page, "Test bank")).toBe(bankBefore + 1000);

  const count = section(page, "Cash ginti aur farq");
  await expect(count.getByText(/Hisaab ke mutabiq:/)).toBeVisible();
  await count.getByRole("spinbutton", { name: "Gini hui cash" }).fill(String(farmBefore - 999));
  await count.getByRole("button", { name: "Cash ginti save karein" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /wajah|reason/i })).toBeVisible();
  await expect.poll(() => accountBalance(page, "Farm galla")).toBe(farmBefore - 1000);
});
