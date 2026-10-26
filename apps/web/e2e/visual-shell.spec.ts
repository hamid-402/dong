import { test, expect, type Page } from "@playwright/test";

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
 * Phase 6 matrix: login / 404 / home × light|dark × desktop|mobile.
 * Windows filenames use *-chromium-win32.png; Linux CI baselines must be
 * captured via workflow `visual-baseline-capture` (see VISUAL-REGRESSION.md).
 *
 * See docs/ops/VISUAL-REGRESSION.md
 */
const enabled =
  process.env.VISUAL_REGRESSION === "1" ||
  process.env.npm_lifecycle_event === "test:visual";

const SCHEMES = [
  { scheme: "light" as const, theme: "paper" as const },
  { scheme: "dark" as const, theme: "midnight" as const },
];

const VIEWPORTS = [
  { id: "desktop" as const, width: 1280, height: 800 },
  { id: "mobile" as const, width: 360, height: 740 },
];

const shotOpts = {
  fullPage: true,
  maxDiffPixelRatio: 0.02,
  animations: "disabled" as const,
};

async function applyScheme(
  page: Page,
  scheme: "light" | "dark",
  theme: "paper" | "midnight",
) {
  await page.evaluate(
    ({ scheme: s, theme: t }) => {
      try {
        window.localStorage.setItem("dang-theme", t);
      } catch {
        /* ignore */
      }
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.setAttribute("data-scheme", s);
    },
    { scheme, theme },
  );
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute("data-scheme")),
    )
    .toBe(scheme);
}

test.describe("visual shell snapshots", () => {
  test.skip(!enabled, "Set VISUAL_REGRESSION=1 to enable (R10-23; CI remains opt-in)");

  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود|Sign in/i })).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", shotOpts);
  });

  test("not-found", async ({ page }) => {
    await page.goto("/not-a-real-route-404-check");
    await expect(page.getByText(/پیدا نشد|not found/i)).toBeVisible();
    await expect(page).toHaveScreenshot("not-found.png", shotOpts);
  });

  for (const { scheme, theme } of SCHEMES) {
    for (const vp of VIEWPORTS) {
      test(`login ${scheme} ${vp.id}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/login");
        await expect(page.getByRole("heading", { name: /ورود|Sign in/i })).toBeVisible();
        await applyScheme(page, scheme, theme);
        await expect(page).toHaveScreenshot(`login-${scheme}-${vp.id}.png`, shotOpts);
      });

      test(`not-found ${scheme} ${vp.id}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/not-a-real-route-404-check");
        await expect(page.getByText(/پیدا نشد|not found/i)).toBeVisible();
        await applyScheme(page, scheme, theme);
        await expect(page).toHaveScreenshot(`not-found-${scheme}-${vp.id}.png`, shotOpts);
      });

      test(`home after login ${scheme} ${vp.id}`, async ({ page, context }) => {
        const { installDevSession } = await import("./helpers/dev-session");
        await installDevSession(context, page);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/home");
        await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
        await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
          timeout: 15_000,
        });
        await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
        await applyScheme(page, scheme, theme);
        await expect(page).toHaveScreenshot(`home-${scheme}-${vp.id}.png`, {
          ...shotOpts,
          maxDiffPixelRatio: 0.03,
        });
      });
    }
  }

  for (const { scheme, theme } of SCHEMES) {
    test(`expense FAB after login ${scheme} mobile`, async ({
      page,
      context,
      request,
    }) => {
      test.skip(
        process.platform === "linux",
        "baseline لینوکس با workflow جداگانه ساخته می‌شود",
      );
      const { installDevSession, resolveWorkspaceSlug } = await import(
        "./helpers/dev-session"
      );
      await installDevSession(context, page);
      const resolved = await resolveWorkspaceSlug(request);
      test.skip(
        !resolved,
        "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for expense FAB visual.",
      );
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(`/w/${resolved!.slug}`);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
      await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
      await applyScheme(page, scheme, theme);
      const fab = page.locator("a.shell-fab");
      await expect(fab).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveScreenshot(
        `expense-fab-${scheme}-mobile.png`,
        shotOpts,
      );
    });
  }

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
    await expect(page).toHaveURL(/\/payments/);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/این فضا پیدا نشد/)).toHaveCount(0);
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
    await expect(page).toHaveURL(/\/approvals/);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/این فضا پیدا نشد/)).toHaveCount(0);
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
    await expect(page).toHaveURL(/\/statements/);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/این فضا پیدا نشد/)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /ریز حساب|Statements/i }),
    ).toBeVisible({ timeout: 20_000 });
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
    // Avoid native print dialog during screenshot capture.
    await page.addInitScript(() => {
      window.print = () => {};
    });
    const printPath = `/w/${resolved!.slug}/statements/${encodeURIComponent(userId!)}/print`;
    await page.goto(printPath);
    await expect(page).toHaveURL(new RegExp(`/statements/.+/print`));
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByText(/در حال آماده‌سازی چاپ/)).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText(/این فضا پیدا نشد/)).toHaveCount(0);
    await expect(
      page.getByText(/دیالوگ چاپ به‌صورت خودکار|Print dialog opens/i),
    ).toBeVisible({ timeout: 20_000 });
    // Apply print media so @media print chrome-hiding CSS is active
    // (must differ from screen `statements.png`).
    await page.emulateMedia({ media: "print" });
    await expect(page).toHaveScreenshot("statements-print.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });
});
