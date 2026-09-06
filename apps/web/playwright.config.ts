import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E — assumes web is reachable (dev or preview).
 * CI can start `pnpm --filter @dang/web start` after build, or skip if BASE_URL unset.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005",
    trace: "on-first-retry",
    locale: "fa-IR",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Prefer system Chrome when Playwright CDN browser download is blocked.
        channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "pnpm exec next start --hostname 127.0.0.1 --port 3005",
        url: "http://127.0.0.1:3005/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
