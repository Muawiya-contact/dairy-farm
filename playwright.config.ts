import { defineConfig, devices } from "@playwright/test";

// Keep the emulated screen and viewport in sync; a desktop screen with a phone
// viewport can mask mobile overflow and shift taps on fixed navigation.
const mobileDevice = { ...devices["Pixel 5"], viewport: { width: 360, height: 780 }, screen: { width: 360, height: 780 } };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1, // Both viewport projects write to one disposable local database.
  retries: 0, // The specs use one reset database; retrying one mutation alone would reuse its records.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: mobileDevice },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/e2e-webserver.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 6 * 60_000,
  },
});
