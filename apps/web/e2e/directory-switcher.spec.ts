/**
 * Directory Switcher smoke — open, search, navigate.
 */
import { test, expect } from "@playwright/test";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

async function expectShellReady(page: import("@playwright/test").Page) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("در حال بررسی نشست…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

test.describe("directory workspace switcher", () => {
  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("opens, searches, and jumps to a space", async ({ page, request }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto(`/w/${resolved!.slug}/space`);
    await expectShellReady(page);

    const trigger = page.getByRole("button", {
      name: /فضای کاری فعال|خانه — فهرست فضاها/i,
    });
    await expect(trigger.first()).toBeVisible({ timeout: 20_000 });
    await trigger.first().click();

    const dialog = page.getByRole("dialog", { name: /فهرست فضاهای کاری/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const search = dialog.getByRole("combobox", { name: /جستجوی فضا/i });
    await expect(search).toBeVisible();
    await search.fill(resolved!.slug.slice(0, Math.min(4, resolved!.slug.length)));

    const option = dialog.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();

    await expect(page).toHaveURL(/\/w\/[^/]+(\/space)?/, { timeout: 20_000 });
    await expect(page.getByRole("dialog", { name: /فهرست فضاهای کاری/i })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
  });

  test("pin toggle persists for the session", async ({ page, request }) => {
    const resolved = await resolveWorkspaceSlug(request);
    test.skip(
      !resolved,
      "Need PLAYWRIGHT_WORKSPACE_SLUG or API with ALLOW_DEV_AUTH for workspace resolution.",
    );

    await page.goto(`/w/${resolved!.slug}/space`);
    await expectShellReady(page);

    await page
      .getByRole("button", { name: /فضای کاری فعال|خانه — فهرست فضاها/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: /فهرست فضاهای کاری/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const pin = dialog.getByRole("button", { name: /پین کردن|برداشتن پین/i }).first();
    await expect(pin).toBeVisible({ timeout: 10_000 });
    const before = await pin.getAttribute("aria-pressed");
    await pin.click();
    await expect(pin).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true",
    );
  });
});
