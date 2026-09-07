import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoCriticalAxe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
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

  test("workspaces classic redirects with session", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("dang.auth.mode", "dev");
    });
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
      `/w/${slug}/expenses`,
      `/w/${slug}/ledger`,
      `/w/${slug}/settlements`,
      `/w/${slug}/metrics`,
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
});
