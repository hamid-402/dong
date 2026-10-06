/**
 * R4 DoD — on a phone viewport, home primary CTA is reachable without forced scroll.
 * Uses seeded workspace when API/demo seed is available; otherwise skips honestly.
 */
import { test, expect, devices } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

test.use({ ...devices["iPhone 13"] });

test.describe("home mobile first fold (R4)", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("primary CTA intersects first viewport without scroll", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH + /demo/seed",
    );

    await page.goto(`/w/${resolved!.slug}`);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });

    const viewport = page.viewportSize();
    expect(viewport, "mobile viewport required").toBeTruthy();
    const vh = viewport!.height;

    // Prefer briefing action links; fall back to first mosaic / shell CTA in #main.
    const cta = page
      .locator(
        "#home-briefing a[href], .mosaicWorkspace a[href*='/expenses'], #main a[href*='/expenses']",
      )
      .first();
    await expect(cta).toBeVisible({ timeout: 20_000 });

    const box = await cta.boundingBox();
    expect(box, "CTA should have layout box").toBeTruthy();
    // Top of CTA must be in the first fold (small slack for safe-area).
    expect(
      box!.y,
      `CTA top ${box!.y} should be within first viewport (${vh}) — no forced scroll`,
    ).toBeLessThan(vh);
    // At least part of the CTA should be visible without scrolling.
    expect(box!.y + Math.min(box!.height, 24)).toBeLessThanOrEqual(vh + 4);
  });
});
