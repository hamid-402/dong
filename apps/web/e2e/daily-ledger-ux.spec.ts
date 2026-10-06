import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * Sprint J — daily ledger UX happy path (overview → day → back; optional + فردی).
 * Soft-skips when session/workspace/API are unavailable — no fake data assertions.
 */

async function expectShellReady(page: Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

async function openDayFromOverview(page: Page): Promise<boolean> {
  const detailBtn = page.getByRole("button", { name: "جزئیات" }).first();
  if (await detailBtn.isVisible().catch(() => false)) {
    await detailBtn.click();
    return true;
  }

  const openToday = page.getByRole("button", { name: "امروز را باز کن" });
  if (await openToday.isVisible().catch(() => false)) {
    await openToday.click();
    return true;
  }

  const goToday = page.getByRole("button", { name: "برو به امروز" });
  if (await goToday.isVisible().catch(() => false)) {
    await goToday.click();
    const after = page.getByRole("button", { name: "جزئیات" }).first();
    if (await after.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await after.click();
      return true;
    }
  }

  return false;
}

test.describe("daily ledger UX happy path", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("overview → day detail → back; optional + فردی menu", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    const slug = resolved!.slug;
    await page.goto(`/w/${slug}/ledger`);
    await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
      timeout: 15_000,
    });
    if (/\/login/.test(page.url())) {
      test.skip(true, "not logged in — boot session unavailable");
    }
    await expectShellReady(page);

    // Overview chrome from live ledger (skip if API/page gate blocks).
    const overviewHint = page.getByText(/خلاصهٔ بازه|دفتر روزانه|خرج روز/);
    const hasOverview = await overviewHint
      .first()
      .isVisible({ timeout: 20_000 })
      .catch(() => false);
    test.skip(!hasOverview, "daily ledger overview not visible (API or gate)");

    const opened = await openDayFromOverview(page);
    test.skip(!opened, "no day entry control (جزئیات / امروز) in this range");

    await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "بازگشت به خلاصه بازه" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("navigation", { name: "مسیر دفتر" })).toBeVisible();

    // Soft: + فردی only when members exist and day is writable.
    const individualBtn = page.getByRole("button", { name: "+ فردی" }).first();
    if (await individualBtn.isVisible().catch(() => false)) {
      await individualBtn.click();
      const memberMenu = page.getByRole("menu", {
        name: "انتخاب عضو برای قلم فردی",
      });
      const menuVisible = await memberMenu
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (menuVisible) {
        await expect(memberMenu.getByRole("menuitem").first()).toBeVisible();
        // Do not post — API may be flaky; menu open is enough.
        await page.keyboard.press("Escape");
      }
    }

    // Prefer explicit back control; crumb "دفتر" / range label is fallback.
    const backBtn = page.getByRole("button", { name: "بازگشت به خلاصه بازه" });
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    } else {
      const crumbNav = page.getByRole("navigation", { name: "مسیر دفتر" });
      await crumbNav.getByRole("button").first().click();
    }

    await expect(page).not.toHaveURL(/\?date=/, { timeout: 10_000 });
    await expect(
      page.getByText(/خلاصهٔ بازه|دفتر روزانه|خرج روز/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
