import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

/**
 * Expense → balance → settlement journey (dong-50 #46).
 *
 * Resolves a workspace via PLAYWRIGHT_WORKSPACE_SLUG or live `/demo/seed`
 * (ALLOW_DEV_AUTH). If neither works, deep tests skip with an explicit reason —
 * never invents balances or expenses.
 */

async function expectShellReady(page: import("@playwright/test").Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

test.describe("expense → balance → settlement journey", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("authenticated spaces surface renders (not redirected to login)", async ({ page }) => {
    await page.goto("/spaces");
    await expectShellReady(page);
    await expect(
      page.getByRole("navigation", { name: /ناوبری/ }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("daily-ledger finance surface keeps the authenticated shell", async ({ page }) => {
    await page.goto("/daily-ledger");
    await expectShellReady(page);
    await expect(page.locator("body")).toBeVisible();
  });

  test("seeded workspace: expenses, settlements, metrics from real data", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or a running API with ALLOW_DEV_AUTH for /demo/seed.",
    );

    const slug = resolved!.slug;

    await page.goto(`/w/${slug}/expenses`);
    await expectShellReady(page);
    // PageHeader is chrome-embedded (no h1); assert real finance panels instead.
    await expect(page.locator("#expense-panel, #settlement-panel").first()).toBeAttached({
      timeout: 20_000,
    });
    await expect(page.getByText(/ثبت خرج|تسویه|مانده/).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/w/${slug}/ledger`);
    await expectShellReady(page);
    await expect(page.getByText(/دفتر روزانه|بازه/).first()).toBeVisible({ timeout: 20_000 });

    await page.goto(`/w/${slug}/settlements`);
    await expectShellReady(page);
    await expect(page.getByText(/تسویه/).first()).toBeVisible({ timeout: 20_000 });

    await page.goto(`/w/${slug}/metrics`);
    await expectShellReady(page);
    await expect(page.getByText(/متریک محصول|منبع: audit|هنوز رویدادی/).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
