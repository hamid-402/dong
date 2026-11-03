/**
 * axe critical/serious = 0 on the four product themes.
 * Themes are applied via data-theme on <html> (tokens.css).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEMES = ["white", "black", "paper", "midnight"] as const;

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

async function openThemed(page: Page, theme: (typeof THEMES)[number], path: string) {
  await page.addInitScript((t) => {
    localStorage.setItem("dang-theme", t);
  }, theme);
  await page.goto(path);
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    )
    .toBe(theme);
}

test.describe("a11y ledger themes", () => {
  for (const theme of THEMES) {
    test(`login has no critical axe on theme=${theme}`, async ({ page }) => {
      await openThemed(page, theme, "/login");
      await expect(page.getByRole("heading", { name: /ورود|Sign in/i })).toBeVisible({
        timeout: 20_000,
      });
      await expectNoCriticalAxe(page);
    });
  }
});
