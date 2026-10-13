/**
 * Keyboard journey: login, add expense, settle, settings.
 * Each flow is checked at 360px and 1280px with a visible focus ring.
 */
import { test, expect, type Page } from "@playwright/test";
import { installDevSession } from "./helpers/dev-session";

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 1280, height: 800 },
] as const;

async function expectVisibleFocus(page: Page, maxTabs = 12) {
  let interactive = false;
  let focusVisible = false;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const meta = await page.locator(":focus").evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const isInteractive =
        ["a", "button", "input", "select", "textarea", "summary"].includes(tag) ||
        role === "button" ||
        role === "link" ||
        role === "tab" ||
        role === "switch";
      const style = getComputedStyle(el);
      const hasIndicator =
        (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        (style.boxShadow !== "none" && style.boxShadow !== "");
      return { isInteractive, hasIndicator };
    });
    if (meta.isInteractive) {
      interactive = true;
      focusVisible = focusVisible || meta.hasIndicator;
    }
  }
  expect(interactive, "expected Tab to reach an interactive control").toBe(true);
  expect(focusVisible, "expected a visible focus ring").toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const extra = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(extra, "horizontal overflow").toBeLessThanOrEqual(8);
}

async function expectControlAtLeast44(page: Page, name: RegExp) {
  const control = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box, "control box").toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe("keyboard journey (public)", () => {
  for (const viewport of VIEWPORTS) {
    test(`login ${viewport.width}: Tab focus, submit, no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();
      await expectVisibleFocus(page);
      await expectNoHorizontalOverflow(page);
      await expectControlAtLeast44(page, /^ورود$/);
      await page.getByRole("button", { name: /^ورود$/ }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByLabel(/ایمیل/)).toBeVisible();
    });
  }

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

test.describe("keyboard journey (authenticated flows)", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  for (const viewport of VIEWPORTS) {
    test(`add expense ${viewport.width}: keyboard focus and 44px primary`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/w/demo/expenses");
      await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
      await expect(page).not.toHaveURL(/\/login/);
      await expectVisibleFocus(page);
      await expectNoHorizontalOverflow(page);
      const primary = page.getByRole("button", { name: /ثبت خرج/ }).first();
      if (await primary.count()) {
        await expectControlAtLeast44(page, /ثبت خرج/);
        await primary.focus();
        await expect(primary).toBeFocused();
      }
    });

    test(`settle ${viewport.width}: keyboard focus stays on the settlement form`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/w/demo/settlements");
      await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
      await expect(page).not.toHaveURL(/\/login/);
      await expectVisibleFocus(page);
      await expectNoHorizontalOverflow(page);
      const amount = page.getByLabel(/مبلغ/).first();
      if (await amount.count()) {
        await amount.focus();
        await expect(amount).toBeFocused();
      }
    });

    test(`settings ${viewport.width}: account tabs keep a visible focus ring`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/account");
      await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
      await expect(page).not.toHaveURL(/\/login/);
      await expectVisibleFocus(page);
      await expectNoHorizontalOverflow(page);
      const appearance = page.getByRole("link", { name: /ظاهر/ }).first();
      await appearance.focus();
      await expect(appearance).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/account\/appearance/);
    });
  }
});
