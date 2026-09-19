import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * G14 — kind reports + procurement gate honesty (secondary paths).
 */
test.describe("G14 secondary path smokes", () => {
  test("kind reports page shows live KPI or honest empty", async ({
    page,
    context,
  }) => {
    await installDevSession(context, page);
    await page.goto("/spaces/reports?kind=group");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByText(/تعداد فضا|هنوز فضای|گزارش|مانده|دسترسی/)
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
});
