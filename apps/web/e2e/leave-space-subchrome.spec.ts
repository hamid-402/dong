import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

async function expectShellReady(page: Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

test.describe("R2 leave-membership from sub-chrome", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("settlements: leave control opens settings danger zone", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto(`/w/${resolved!.slug}/settlements`);
    await expectShellReady(page);

    const leave = page.getByRole("link", {
      name: /ترک عضویت|Leave membership|خروج از این فضا|Leave this space/i,
    });
    await expect(leave.first()).toBeVisible({ timeout: 20_000 });
    await leave.first().click();
    await expect(page).toHaveURL(/\/settings#danger|\/settings$/, { timeout: 20_000 });
    await expect(page.locator("#danger")).toBeVisible({ timeout: 15_000 });
  });

  test("members: leave control opens settings danger zone", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto(`/w/${resolved!.slug}/members`);
    await expectShellReady(page);

    const leave = page.getByRole("link", {
      name: /ترک عضویت|Leave membership|خروج از این فضا|Leave this space/i,
    });
    await expect(leave.first()).toBeVisible({ timeout: 20_000 });
    await leave.first().click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 20_000 });
    await expect(page.locator("#danger")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("settings danger zone surface", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("settings#danger shows role-aware lifecycle panel", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto(`/w/${resolved!.slug}/settings#danger`);
    await expectShellReady(page);
    await expect(page.getByRole("heading", { name: /اقدامات برگشت‌پذیر|دفتر شخصی|ترک، بایگانی/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
