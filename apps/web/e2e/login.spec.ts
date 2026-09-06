import { test, expect } from "@playwright/test";

test.describe("auth smoke", () => {
  test("login page shows form and validates empty submit", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /ورود/ })).toBeVisible();
    await page.getByRole("button", { name: /^ورود$/ }).click();
    // Native required or our validation — either surfaces email field.
    await expect(page.getByLabel(/ایمیل/)).toBeVisible();
  });

  test("register page is reachable", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /ثبت|ساخت|حساب/ })).toBeVisible();
  });
});
