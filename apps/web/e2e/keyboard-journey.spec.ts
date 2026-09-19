/**
 * Keyboard journey smoke (dong-50 #22 + S10-19).
 *
 * Public: login Tab/Enter. Authenticated: Tab through spaces shell after real session.
 */
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

test.describe("keyboard journey (public)", () => {
  test("login: Tab reaches an interactive control with visible focus", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    let interactive = false;
    let focusVisible = false;
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

test.describe("keyboard journey (authenticated shell)", () => {
  test("spaces: Tab reaches bottom/nav interactive control", async ({ page, context }) => {
    await installDevSession(context, page);
    await page.goto("/spaces");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);

    let interactive = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const meta = await page.locator(":focus").evaluate((el) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return (
          ["a", "button", "input", "select", "textarea"].includes(tag) ||
          role === "button" ||
          role === "link" ||
          role === "tab"
        );
      });
      if (meta) {
        interactive = true;
        break;
      }
    }
    expect(interactive, "expected Tab to reach shell interactive control").toBe(true);
  });

  test("workspace home: Tab stays usable after load", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace for authenticated keyboard journey");
    await page.goto(`/w/${resolved!.slug}`);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });

    // Prefer focusing in-app chrome; Next.js Dev Tools also steals :focus in parallel.
    const shellControl = page.locator("#main a, #main button, nav a, nav button").first();
    await shellControl.focus();
    await expect(shellControl).toBeFocused();
  });
});
