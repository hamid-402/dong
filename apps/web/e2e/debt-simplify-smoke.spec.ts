import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * Soft smoke for debt-simplify UI (W4 leftover).
 * Skips when seed/API unavailable — does not hard-fail CI without runtime.
 */
test.describe("debt simplify smoke", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("settlements page ready; simplify copy when suggestions exist", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for simplify smoke.",
    );

    const slug = resolved!.slug;
    await page.goto(`/w/${slug}/settlements`);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByText(/تسویه/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#settlement-panel")).toBeAttached({ timeout: 20_000 });

    // Panel only mounts when API returns suggestions/claims — assert shell path is live.
    const simplifyHint = page.getByText(/پیشنهاد تسویه حداقلی|ادعاهای باز ساده‌سازی/);
    if ((await simplifyHint.count()) > 0) {
      await expect(simplifyHint.first()).toBeVisible();
    }
  });
});
