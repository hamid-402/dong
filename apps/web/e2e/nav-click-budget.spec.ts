import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * Phase 3 click-budget: frequent actions should be reachable from /home
 * with at most 2 navigational clicks (tile/link), not counting form fills.
 */

async function expectShellReady(page: Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

test.describe("home navigation click budget", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("expenses reachable from /home within 2 clicks", async ({ page, request }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto("/home");
    await expectShellReady(page);

    const expenseLink = page.locator('a[href*="/expenses"]').first();
    await expect(expenseLink).toBeVisible({ timeout: 20_000 });
    await expenseLink.click();
    await expect(page).toHaveURL(/\/expenses/, { timeout: 20_000 });
    // Budget: 1 click from home mosaic (≤2).
  });

  test("settlements reachable from /home within 2 clicks", async ({ page, request }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto("/home");
    await expectShellReady(page);

    // May need folder drill (1) + tile (2) = still within budget of 2.
    const settleDirect = page.locator('a[href*="/settlements"]').first();
    if (await settleDirect.isVisible().catch(() => false)) {
      await settleDirect.click();
      await expect(page).toHaveURL(/\/settlements/, { timeout: 20_000 });
      return;
    }

    const financeFolder = page
      .getByRole("link")
      .filter({ hasText: /مالی|خرج|Finance/i })
      .first();
    await expect(financeFolder).toBeVisible({ timeout: 20_000 });
    await financeFolder.click();
    const settleAfter = page.locator('a[href*="/settlements"]').first();
    await expect(settleAfter).toBeVisible({ timeout: 20_000 });
    await settleAfter.click();
    await expect(page).toHaveURL(/\/settlements/, { timeout: 20_000 });
  });
});
