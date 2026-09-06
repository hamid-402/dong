import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Honest a11y smoke: runs axe against the real login page (no mocked content).
 * Requires a reachable web server (Playwright webServer or existing dev).
 */
test.describe("a11y login", () => {
  test("login page has no critical axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(
      critical,
      critical
        .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)
        .join("\n") || "no critical/serious violations",
    ).toEqual([]);
  });
});
