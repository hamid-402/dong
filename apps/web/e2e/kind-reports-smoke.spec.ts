import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * G14/G17 — kind reports + secondary path honesty (procurement, personal hub, charts link).
 */
test.describe("G14/G17 secondary path smokes", () => {
  test("kind reports page shows live KPI or honest empty", async ({
    page,
    context,
  }) => {
    await installDevSession(context, page);
    await page.goto("/spaces/reports?kind=group");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByText(/تعداد فضا|هنوز فضای|گزارش|مانده|دسترسی|خروجی CSV|charts_v1/)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("personal-template procurement deep link shows gate or module UI", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace");

    await page.goto(`/w/${resolved!.slug}/procurement`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByText(/تدارکات|خرید|دسترسی مجاز نیست|این قالب|ماژول/)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("personal finance hub deep-links (#charts / #goals) stay on /me/finance", async ({
    page,
    context,
  }) => {
    await installDevSession(context, page);
    await page.goto("/me/finance#charts");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .toBe("/me/finance");
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByText(/مالی شخصی|اهداف|نمودار|منابع|charts|goals_v1|در دسترس نیست/).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/me/finance#goals");
    await expect
      .poll(() => new URL(page.url()).hash, { timeout: 10_000 })
      .toMatch(/goals/);
  });

  test("workspace charts deep link never blank — denied, off, or live chrome", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace");

    await page.goto(`/w/${resolved!.slug}/charts`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByText(
          /روند خرج|analytics پلن|providers\.charts|charts_v1|گزارش تجمیعی|دادهٔ جعلی/,
        )
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
