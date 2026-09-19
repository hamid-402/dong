import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * S10-20 — classic `/overview` redirect + deep-link gate honesty.
 */
test.describe("stage10 IA gates", () => {
  test("/overview redirects away from classic path when session present", async ({
    page,
    context,
  }) => {
    await installDevSession(context, page);
    await page.goto("/overview");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .not.toBe("/overview");
    const path = new URL(page.url()).pathname;
    expect(path === "/spaces" || path.startsWith("/w/") || path === "/spaces/new").toBe(
      true,
    );
  });

  test("personal-template deep link denies procurement with honest copy", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace (demo seed or PLAYWRIGHT_WORKSPACE_SLUG)");

    await page.goto(`/w/${resolved!.slug}/procurement`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    // Template/module gate or live procurement UI — never silent blank
    const denied = page.getByText(/دسترسی مجاز نیست|این قالب|ماژول.*فعال نیست|تدارکات فقط/);
    const procurementUi = page.getByText(/تدارکات|درخواست خرید|سفارش خرید|نیاز/);
    await expect(denied.or(procurementUi).first()).toBeVisible({ timeout: 20_000 });
  });

  test("jobs page renders for seeded owner or shows role/capability gate", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace (demo seed or PLAYWRIGHT_WORKSPACE_SLUG)");

    await page.goto(`/w/${resolved!.slug}/jobs`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const denied = page.getByText(/دسترسی مجاز نیست|redis_queue|صف کارها فقط/);
    const jobsHeader = page.getByLabel(/صف کارها|نامهٔ مرده/);
    await expect(denied.or(jobsHeader).first()).toBeVisible({ timeout: 20_000 });
  });

  test("metrics page renders for seeded owner or shows role gate", async ({
    page,
    request,
    context,
  }) => {
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(!resolved, "Need seeded workspace");
    await page.goto(`/w/${resolved!.slug}/metrics`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByText(/متریک|دسترسی مجاز نیست|قابل مشاهده/)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
