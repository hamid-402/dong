import { test, expect } from "@playwright/test";

/**
 * R10-23 / S11-12 / D3 — visual regression (opt-in only).
 *
 * Enable:
 *   VISUAL_REGRESSION=1   or   pnpm --filter @dang/web test:visual
 *
 * Local Windows when Playwright CDN Chromium is blocked:
 *   PLAYWRIGHT_CHANNEL=chrome
 *   PLAYWRIGHT_SKIP_WEBSERVER=1   (if web already on :3005)
 *
 * Baselines:
 *   apps/web/e2e/visual-shell.spec.ts-snapshots/
 *   Prefer regenerating on the same OS/font as the runner that will compare
 *   (Linux CI vs Windows local will differ — do not hard-fail CI by default).
 *   Update: playwright test e2e/visual-shell.spec.ts --update-snapshots
 *
 * See docs/ops/VISUAL-REGRESSION.md
 */
const enabled =
  process.env.VISUAL_REGRESSION === "1" ||
  process.env.npm_lifecycle_event === "test:visual";

test.describe("visual shell snapshots", () => {
  test.skip(!enabled, "Set VISUAL_REGRESSION=1 to enable (R10-23; CI remains opt-in)");

  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود|Sign in/i })).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("not-found", async ({ page }) => {
    await page.goto("/not-a-real-route-404-check");
    await expect(page.getByText(/پیدا نشد|not found/i)).toBeVisible();
    await expect(page).toHaveScreenshot("not-found.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("admin gate (honest 404 or console)", async ({ page, context }) => {
    const { installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    await page.goto("/admin");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot("admin-gate.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });

  test("payments page when seeded (skip if no seed)", async ({
    page,
    request,
    context,
  }) => {
    const { resolveWorkspaceSlug, installDevSession } = await import(
      "./helpers/dev-session"
    );
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for payments visual.",
    );
    await page.goto(`/w/${resolved!.slug}/payments`);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot("payments.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });

  test("approvals page when seeded (skip if no seed)", async ({
    page,
    request,
    context,
  }) => {
    const { resolveWorkspaceSlug, installDevSession } = await import(
      "./helpers/dev-session"
    );
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for approvals visual.",
    );
    await page.goto(`/w/${resolved!.slug}/approvals`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot("approvals.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });

  test("statements page when seeded (skip if no seed)", async ({
    page,
    request,
    context,
  }) => {
    const { resolveWorkspaceSlug, installDevSession } = await import(
      "./helpers/dev-session"
    );
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for statements visual.",
    );
    await page.evaluate(() => {
      try {
        window.localStorage.setItem("dang.statements.tour.v1", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(`/w/${resolved!.slug}/statements`);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot("statements.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });

  test("statements print chrome-free when seeded (skip if no seed)", async ({
    page,
    request,
    context,
  }) => {
    const { resolveWorkspaceSlug, installDevSession } = await import(
      "./helpers/dev-session"
    );
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for statements print visual.",
    );
    const me = await page.request.get("/api/v1/auth/me").then((r) => r.json()).catch(() => null);
    const userId = me?.actor?.userId as string | undefined;
    test.skip(!userId, "Need authenticated actor for print route.");
    await page.goto(
      `/w/${resolved!.slug}/statements/${encodeURIComponent(userId!)}/print`,
    );
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot("statements-print.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });
});
