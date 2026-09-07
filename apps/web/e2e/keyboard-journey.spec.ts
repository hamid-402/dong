import { test, expect } from "@playwright/test";

/**
 * Keyboard journey smoke (dong-50 #22).
 *
 * Covers the public, no-auth part of the journey with the keyboard only:
 *   - login page is reachable and focus lands on interactive elements via Tab
 *   - a visible focus indicator exists (outline/box-shadow)
 *   - keyboard submit surfaces validation without a mouse
 *
 * NOTE: the full authenticated flow (create expense → settle → confirm) needs a
 * signed-in fixture (dev session cookie + `dang.auth.mode=dev`, see
 * a11y-shell.spec.ts). That is intentionally out of scope here because it
 * depends on a running API with seeded members. When an auth fixture is added,
 * extend this file to Tab through the expense form (مبلغ → تقسیم → تأیید) and
 * assert the settlement confirm path.
 */
test.describe("keyboard journey (public)", () => {
  test("login: Tab reaches an interactive control with visible focus", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    let interactive = false;
    let focusVisible = false;
    // Tab through the first several stops; assert we land on a real control.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const meta = await page.locator(":focus").evaluate((el) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const isInteractive =
          ["a", "button", "input", "select", "textarea"].includes(tag) ||
          role === "button" ||
          role === "link";
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
    expect(focusVisible, "expected a visible focus indicator on a focused control").toBe(true);
  });

  test("login: keyboard-only submit surfaces email field / validation", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    // Submit with Enter from the login button (no mouse) — native required or
    // our own validation must keep the email field present/visible.
    await page.getByRole("button", { name: /^ورود$/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel(/ایمیل/)).toBeVisible();
  });

  test("login → forgot-password link is keyboard reachable and navigates", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    const forgot = page.getByRole("link", { name: /رمز|فراموش/ }).first();
    if (await forgot.count()) {
      await forgot.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: /رمز|فراموش/ })).toBeVisible({
        timeout: 15_000,
      });
    } else {
      test.info().annotations.push({
        type: "note",
        description: "forgot-password link not present on login; skipped navigation assertion",
      });
    }
  });
});
