import { expect, test } from "vitest";
import { isPasswordSetupLink, passwordSetupError } from "../src/lib/auth-password";

test("recognizes invite and recovery redirects without treating a normal page as setup", () => {
  expect(isPasswordSetupLink("https://farm.example/#access_token=token&type=invite")).toBe(true);
  expect(isPasswordSetupLink("https://farm.example/?type=recovery#access_token=token")).toBe(true);
  expect(isPasswordSetupLink("https://farm.example/#access_token=token&type=signup")).toBe(false);
  expect(isPasswordSetupLink("https://farm.example/")).toBe(false);
  expect(isPasswordSetupLink("not a URL")).toBe(false);
});

test("rejects short or mismatched passwords before calling Auth", () => {
  expect(passwordSetupError("short", "short")).toMatch(/8 characters/);
  expect(passwordSetupError("long-enough", "different")).toMatch(/aik jaisay/);
  expect(passwordSetupError("long-enough", "long-enough")).toBeNull();
});
