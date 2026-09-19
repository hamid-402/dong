import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoCriticalAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  const moderate = results.violations.filter(
    (v) => v.impact === "moderate" || v.impact === "minor",
  );
  for (const v of moderate) {
    console.warn(
      `[a11y ${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
    );
  }
  expect(
    critical,
    critical.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join("\n") ||
      "no critical/serious violations",
  ).toEqual([]);
}

test.describe("a11y public surfaces", () => {
  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();
    await expectNoCriticalAxe(page);
  });

  test("register", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /ثبت|ساخت|حساب/ })).toBeVisible();
    await expectNoCriticalAxe(page);
  });

  test("forgot password", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /رمز|فراموش/ })).toBeVisible();
    await expectNoCriticalAxe(page);
  });

  test("invite accept (public)", async ({ page }) => {
    await page.goto("/invite?token=e2e-smoke");
    await expect(page.locator("body")).toBeVisible();
    await expectNoCriticalAxe(page);
  });

  test("login keyboard focus is visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();

    const meta = await focused.evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const interactive =
        ["a", "button", "input", "select", "textarea"].includes(tag) ||
        role === "button" ||
        role === "link" ||
        el.getAttribute("tabindex") !== null;
      const style = getComputedStyle(el);
      const focusVisible =
        (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        style.boxShadow !== "none" ||
        style.outline !== "none";
      return { interactive, focusVisible, tag };
    });

    expect(meta.interactive, `expected interactive focus, got <${meta.tag}>`).toBe(true);
    expect(meta.focusVisible, "expected a visible focus indicator").toBe(true);
  });
});

test.describe("a11y product shell (dev session cookie)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "dang_web_session",
        value: "1",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  });

  test("spaces list shell", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("dang.auth.mode", "dev");
    });
    await page.goto("/spaces");
    await expect(page.getByRole("navigation", { name: /ناوبری/ }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expectNoCriticalAxe(page);
  });

  test("account page shell", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("dang.auth.mode", "dev");
    });
    await page.goto("/account");
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expectNoCriticalAxe(page);
  });

  test("workspaces classic redirects with session", async ({ page, context }) => {
    const { installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    await page.goto("/workspaces");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    // Classic route should leave /workspaces (hub/workspace redirect or spaces/new).
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .not.toBe("/workspaces");
    await expect(page.locator("body")).toBeVisible();
  });

  test("account security shell", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("dang.auth.mode", "dev");
    });
    await page.goto("/account/security");
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expectNoCriticalAxe(page);
  });

  // High-traffic product routes (dong-50 #11). Prefer a seeded slug when API is up.
  test("seeded workspace high-traffic routes axe", async ({ page, request, context }) => {
    const { resolveWorkspaceSlug, installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed (ALLOW_DEV_AUTH) for seeded a11y.",
    );
    const slug = resolved!.slug;
    for (const path of [
      `/w/${slug}`,
      `/w/${slug}/space`,
      `/w/${slug}/expenses`,
      `/w/${slug}/ledger`,
      `/w/${slug}/settlements`,
      `/w/${slug}/invoices`,
      `/w/${slug}/recurring`,
      `/w/${slug}/addons`,
      `/w/${slug}/approvals`,
      `/w/${slug}/settings`,
      `/w/${slug}/audit`,
      `/w/${slug}/metrics`,
      `/w/${slug}/jobs`,
      `/w/${slug}/more`,
      `/w/${slug}/catalog`,
      `/w/${slug}/payments`,
      `/w/${slug}/statements`,
      `/w/${slug}/charts`,
      `/w/${slug}/permissions`,
      `/account/friends`,
      `/account/privacy`,
      `/me/finance`,
      `/not-a-real-route-404-check`,
    ] as const) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      await expectNoCriticalAxe(page);
    }
  });

  // Fallback chrome coverage when seed is unavailable (may redirect to /spaces).
  for (const route of [
    "/w/demo/expenses",
    "/w/demo/ledger",
    "/w/demo/procurement",
    "/w/demo/proposals",
    "/w/demo/settlements",
    "/w/demo/approvals",
    "/w/demo/addons",
    "/w/demo/metrics",
    "/w/demo/catalog",
  ] as const) {
    test(`workspace route chrome ${route}`, async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem("dang.auth.mode", "dev");
      });
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      await expectNoCriticalAxe(page);
    });
  }

  /**
   * Soft-skip landmark pass for approvals / addons / metrics / catalog when no workspace.
   */
  test("approvals addons metrics catalog landmarks when seeded", async ({
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
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for approvals/addons/metrics/catalog a11y.",
    );
    const slug = resolved!.slug;
    for (const path of [
      `/w/${slug}/approvals`,
      `/w/${slug}/addons`,
      `/w/${slug}/metrics`,
      `/w/${slug}/catalog`,
    ] as const) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      const main = page.locator("#main");
      const gate = page.getByText(/فعال نیست|دسترسی|پیدا نشد|not found|فضای کاری/i);
      await expect(main.or(gate).first()).toBeVisible({ timeout: 20_000 });
      await expectNoCriticalAxe(page);
    }
  });

  /**
   * D3 / R10-13 — focused landmarks (not full axe matrix) for payments + platform.
   * Skip when seed unavailable; assert real copy only (capability-honest).
   */
  test("payments page exposes main landmark and on-behalf status copy", async ({
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
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for payments a11y.",
    );
    await page.goto(`/w/${resolved!.slug}/payments`);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/پرداخت به‌جای|Pay on behalf|فیش|stub/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("platform admin shell is main landmark or honest not-found", async ({
    page,
    context,
  }) => {
    const { installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    await page.goto("/admin");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const main = page.locator("#main");
    const notFound = page.getByRole("heading", {
      name: /پیدا نشد|not found|Access|دسترسی/i,
    });
    await expect(main.or(notFound).first()).toBeVisible({ timeout: 20_000 });
  });

  test("platform SLO shell is main landmark or honest not-found", async ({
    page,
    context,
  }) => {
    const { installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    await page.goto("/admin/slo");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const main = page.locator("#main");
    const notFound = page.getByRole("heading", {
      name: /پیدا نشد|not found|Access|دسترسی/i,
    });
    await expect(main.or(notFound).first()).toBeVisible({ timeout: 20_000 });
  });

  test("platform vault shell is main landmark or honest not-found", async ({
    page,
    context,
  }) => {
    const { installDevSession } = await import("./helpers/dev-session");
    await installDevSession(context, page);
    await page.goto("/admin/vault");
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const main = page.locator("#main");
    const notFound = page.getByRole("heading", {
      name: /پیدا نشد|not found|Access|دسترسی/i,
    });
    await expect(main.or(notFound).first()).toBeVisible({ timeout: 20_000 });
  });

  test("security-ops page landmark when seeded (skip if no seed)", async ({
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
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for security-ops a11y.",
    );
    await page.goto(`/w/${resolved!.slug}/security-ops`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const main = page.locator("#main");
    const emptyOrGate = page.getByText(
      /امنیت|security|فعال نیست|دسترسی|پیدا نشد|not found/i,
    );
    await expect(main.or(emptyOrGate).first()).toBeVisible({ timeout: 20_000 });
  });

  test("statements page landmark when seeded (skip if no seed)", async ({
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
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for statements a11y.",
    );
    await page.goto(`/w/${resolved!.slug}/statements`);
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      try {
        window.localStorage.setItem("dang.statements.tour.v1", "1");
      } catch {
        /* ignore */
      }
    });
    await page.reload();
    await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
    const landmark = page
      .locator("#main")
      .or(page.getByText(/صورتحساب|statement|فعال نیست|دسترسی|پیدا نشد|not found/i));
    await expect(landmark.first()).toBeVisible({ timeout: 20_000 });
    const rail = page.locator('[aria-label*="خلاصه اعضا"], [aria-label*="Members"]');
    if ((await rail.count()) > 0) {
      await rail.first().focus();
      await page.keyboard.press("Tab");
    }
    await expectNoCriticalAxe(page);
  });
});
