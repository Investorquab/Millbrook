import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Millbrook. Runs the e2e flow and the screenshot review
 * against the web dev server. The server is started automatically unless one is
 * already running on :5173 (reuseExistingServer).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: false,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @millbrook/web dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
