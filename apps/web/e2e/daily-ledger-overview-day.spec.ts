import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

async function expectShellReady(page: Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

/**
 * Overview ↔ day detail navigation for the redesigned daily ledger.
 */
test.describe("daily ledger overview ↔ day detail", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("جزئیات opens day view with ?date= and back clears it", async ({
    page,
    request,
  }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or a running API with ALLOW_DEV_AUTH for /demo/seed.",
    );

    const slug = resolved!.slug;
    await page.goto(`/w/${slug}/ledger`);
    await expectShellReady(page);

    await expect(page.getByRole("columnheader", { name: "خرج روز" })).toBeVisible({
      timeout: 20_000,
    });

    const detailBtn = page.getByRole("button", { name: "جزئیات" }).first();
    await expect(detailBtn).toBeVisible({ timeout: 15_000 });
    await detailBtn.click();

    await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /بازه/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("خرج").first()).toBeVisible();

    await page.getByRole("button", { name: /بازه/ }).click();
    await expect(page).not.toHaveURL(/\?date=/, { timeout: 10_000 });
    await expect(page.getByRole("columnheader", { name: "خرج روز" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
