import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Smoke E2E — assumes web is reachable (dev or preview).
 * CI can start `pnpm --filter @dang/web start` after build, or skip if BASE_URL unset.
 *
 * Artifacts live under repo `artifacts/` (gitignored) so next.dev / turbopack
 * watchers under apps/web do not reload when Playwright writes results.
 */
const playwrightArtifactsRoot = resolve(__dirname, "../../artifacts/playwright");

export default defineConfig({
  testDir: "./e2e",
  outputDir: resolve(playwrightArtifactsRoot, "test-results"),
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: resolve(playwrightArtifactsRoot, "report") }],
  ],
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
        // Default: Playwright-bundled Chromium. Set PLAYWRIGHT_CHANNEL=chrome only when
        // using a system browser (e.g. local CDN install blocked).
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
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
