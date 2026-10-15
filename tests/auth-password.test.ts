import { expect, test } from "vitest";
import { isPasswordSetupSession, passwordLinkError, passwordRecoveryRedirect, passwordSetupError } from "../src/lib/auth-password";

test("offers password setup only for the session returned by the invite or recovery link", () => {
  expect(isPasswordSetupSession("https://farm.example/#access_token=token&type=invite", "token")).toBe(true);
  expect(isPasswordSetupSession("https://farm.example/?type=recovery#access_token=token", "token")).toBe(true);
  expect(isPasswordSetupSession("https://farm.example/#access_token=token&type=invite", "previous-user-token")).toBe(false);
  expect(isPasswordSetupSession("https://farm.example/#access_token=token&type=invite", undefined)).toBe(false);
  expect(isPasswordSetupSession("https://farm.example/#access_token=token&type=signup", "token")).toBe(false);
  expect(isPasswordSetupSession("not a URL", "token")).toBe(false);
});

test("explains failed email redirects without exposing the provider's raw error", () => {
  expect(passwordLinkError("https://farm.example/#error=access_denied&error_code=otp_expired")).toMatch(/expire/);
  expect(passwordLinkError("https://farm.example/?error=access_denied&error_description=private-detail")).not.toContain("private-detail");
  expect(passwordLinkError("https://farm.example/")).toBeNull();
});

test("rejects short or mismatched passwords before calling Auth", () => {
  expect(passwordSetupError("short", "short")).toMatch(/8 characters/);
  expect(passwordSetupError("long-enough", "different")).toMatch(/aik jaisay/);
  expect(passwordSetupError("long-enough", "long-enough")).toBeNull();
});

test("sends recovery links to the current site's root, not a record URL", () => {
  expect(passwordRecoveryRedirect("https://farm.example/khata/?id=private-record")).toBe("https://farm.example/");
  expect(passwordRecoveryRedirect("http://localhost:3000/settings/")).toBe("http://localhost:3000/");
});
