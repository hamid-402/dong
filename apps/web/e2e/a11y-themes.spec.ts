/**
 * R4 — axe critical/serious = 0 across the five product themes.
 * Themes are applied via data-theme on <html> (tokens.css).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEMES = ["dark", "light", "dusk", "mist", "linear"] as const;

async function expectNoCriticalAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    critical,
    critical.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join("\n") ||
      "no critical/serious violations",
  ).toEqual([]);
}

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    )
    .toBe(theme);
}

test.describe("a11y five themes (R4)", () => {
  for (const theme of THEMES) {
    test(`login has no critical axe on theme=${theme}`, async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: /ورود|Sign in/i })).toBeVisible({
        timeout: 20_000,
      });
      await setTheme(page, theme);
      await expectNoCriticalAxe(page);
    });
  }
});
