/**
 * R6 — finance axe + keyboard fail-closed (no soft-skip for required surfaces).
 *
 * Always covers public/demo finance chrome. Seeded workspace routes are required
 * when A11Y_REQUIRE_FINANCE=1 (CI); otherwise skip with an explicit reason.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

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

async function expectTabReachesInteractive(page: Page, maxTabs = 14) {
  let interactive = false;
  let focusVisible = false;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const meta = await page.locator(":focus").evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const isInteractive =
        ["a", "button", "input", "select", "textarea"].includes(tag) ||
        role === "button" ||
        role === "link" ||
        role === "tab";
      const style = getComputedStyle(el);
      const hasIndicator =
        (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        style.boxShadow !== "none";
      return { isInteractive, hasIndicator };
    });
    if (meta.isInteractive) {
      interactive = true;
      focusVisible = focusVisible || meta.hasIndicator;
    }
  }
  expect(interactive, "expected Tab to reach an interactive control").toBe(true);
  expect(focusVisible, "expected a visible focus indicator").toBe(true);
}

test.describe("a11y finance (fail-closed)", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("personal finance hub axe", async ({ page }) => {
    await page.goto("/me/finance");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expectNoCriticalAxe(page);
  });

  test("demo expenses chrome axe (always)", async ({ page }) => {
    await page.goto("/w/demo/expenses");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expectNoCriticalAxe(page);
  });

  test("demo settlements chrome axe (always)", async ({ page }) => {
    await page.goto("/w/demo/settlements");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expectNoCriticalAxe(page);
  });

  test("expenses keyboard focus is usable", async ({ page }) => {
    await page.goto("/w/demo/expenses");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const shell = page.locator("#main a, #main button, nav a, nav button").first();
    if ((await shell.count()) > 0) {
      await shell.focus();
      await expect(shell).toBeFocused();
    } else {
      await expectTabReachesInteractive(page);
    }
  });

  test("seeded workspace finance routes axe", async ({ page, request }) => {
    const requireFinance = process.env.A11Y_REQUIRE_FINANCE === "1";
    const resolved = await resolveWorkspaceSlug(request);
    if (!resolved) {
      if (requireFinance) {
        throw new Error(
          "A11Y_REQUIRE_FINANCE=1 but workspace seed/slug unavailable — finance a11y cannot soft-skip",
        );
      }
      test.skip(true, "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for seeded finance a11y");
      return;
    }
    const slug = resolved.slug;
    for (const path of [
      `/w/${slug}/expenses`,
      `/w/${slug}/settlements`,
      `/w/${slug}/invoices`,
      `/me/finance`,
    ] as const) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      await expectNoCriticalAxe(page);
    }
  });
});
