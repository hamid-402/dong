import { expect, test } from "@playwright/test";

/**
 * Deep statements journey — requires API + web + demo seed / workspace slug.
 * Skips cleanly when seed unavailable (same pattern as a11y-shell).
 */
test.describe("statements member journey", () => {
  test("open statements, URL sync, export or gate, print, payout settings anchor", async ({
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
      "Need PLAYWRIGHT_WORKSPACE_SLUG or /demo/seed for statements journey.",
    );
    const slug = resolved!.slug;
    await page.goto(`/w/${slug}/statements`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    const gateOrBill = page.getByText(
      /صورتحساب|statement|فعال نیست|دستور واریز|قابل پرداخت|بستانکار|متوازن|خطی در این بازه نیست|تطبیق/i,
    );
    await expect(gateOrBill.first()).toBeVisible({ timeout: 25_000 });

    await expect
      .poll(async () => new URL(page.url()).searchParams.get("from"), {
        timeout: 10_000,
      })
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const csvBtn = page.getByRole("button", { name: /CSV|خروجی CSV|دانلود CSV/i });
    if (await csvBtn.count()) {
      await csvBtn.first().click();
      await expect(
        page.getByText(/آماده|دانلود|export|خروجی|خطا|ناموفق/i).first(),
      ).toBeVisible({ timeout: 20_000 });
    }

    const printLink = page.getByRole("link", { name: /چاپ|PDF|printable/i }).first();
    if (await printLink.count()) {
      const href = await printLink.getAttribute("href");
      if (href) {
        await page.goto(href);
        await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
        await expect(
          page.getByText(/صورتحساب|statement|فعال نیست|خطی در این بازه نیست|تطبیق/i).first(),
        ).toBeVisible({ timeout: 20_000 });
      }
    }

    await page.goto(`/w/${slug}/settings#payout`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/دستور واریز|payout|مقصد|شبا|کارت|فعال نیست/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
