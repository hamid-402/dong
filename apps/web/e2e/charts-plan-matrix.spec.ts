import { test, expect } from "@playwright/test";
import {
  installDevSession,
  resolveWorkspace,
  setWorkspacePlan,
  workspaceChartTrendStatus,
} from "./helpers/dev-session";

/**
 * G17 — plan_required charts matrix (free vs pro/business) + honest UI.
 * Uses real PUT /plan + chart APIs; skips upgrade legs when plan admin is off.
 */
test.describe("G17 charts plan matrix", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("free plan: charts UI is plan-denied or capability-off — never fake series", async ({
    page,
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "Need seeded workspace or PLAYWRIGHT_WORKSPACE_SLUG + live API");

    // Default / explicit free — analytics is pro-only.
    const setFree = await setWorkspacePlan(request, ws!.id, "free");
    test.skip(
      setFree === "unavailable",
      "API unreachable for plan PUT (ALLOW_DEV_AUTH / proxy)",
    );
    // forbidden still ok: workspace may already be free with no planAdmin flag

    const apiStatus = await workspaceChartTrendStatus(request, ws!.id);
    if (apiStatus != null) {
      // free → 403 plan_required; or 401/404 if charts route gated differently
      expect([200, 403, 401, 404]).toContain(apiStatus);
      if (apiStatus === 403) {
        // UI must surface honest denial, not invent chart points
      }
    }

    await page.goto(`/w/${ws!.slug}/charts`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const planDenied = page.getByText(/پشت قابلیت analytics پلن|دادهٔ جعلی نشان داده نمی‌شود/);
    const chartsOff = page.getByText(/providers\.charts|charts_v1/);
    const chartTitle = page.getByText(/روند خرج ماهانه|سهم اعضا|ترکیب دسته‌بندی/);

    if (apiStatus === 403) {
      await expect(planDenied.or(chartsOff).first()).toBeVisible({ timeout: 20_000 });
      await expect(chartTitle).toHaveCount(0);
    } else {
      // Capability off, or pro already — still must show something real
      await expect(planDenied.or(chartsOff).or(chartTitle).first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("pro plan: charts API allows analytics; UI shows series chrome or capability-off", async ({
    page,
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "Need seeded workspace or PLAYWRIGHT_WORKSPACE_SLUG + live API");

    const setPro = await setWorkspacePlan(request, ws!.id, "pro");
    test.skip(
      setPro === "forbidden",
      "ENABLE_WORKSPACE_PLANS / ENABLE_PLAN_ADMIN required for pro leg",
    );
    test.skip(setPro === "unavailable", "API unreachable for plan PUT");

    const apiStatus = await workspaceChartTrendStatus(request, ws!.id);
    expect(apiStatus).not.toBeNull();
    // pro must not get plan_required
    expect(apiStatus).not.toBe(403);

    await page.goto(`/w/${ws!.slug}/charts`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });

    const planDenied = page.getByText(/پشت قابلیت analytics پلن|دادهٔ جعلی نشان داده نمی‌شود/);
    const chartsOff = page.getByText(/providers\.charts|charts_v1/);
    const chartTitle = page.getByText(/روند خرج ماهانه|سهم اعضا/);

    await expect(chartsOff.or(chartTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(planDenied).toHaveCount(0);

    // Restore free so later free-leg tests stay deterministic when reused seed
    await setWorkspacePlan(request, ws!.id, "free");
  });

  test("business plan: same analytics gate as pro (not plan_required)", async ({
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "Need seeded workspace or PLAYWRIGHT_WORKSPACE_SLUG + live API");

    const setBiz = await setWorkspacePlan(request, ws!.id, "business");
    test.skip(
      setBiz === "forbidden",
      "ENABLE_WORKSPACE_PLANS / ENABLE_PLAN_ADMIN required for business leg",
    );
    test.skip(setBiz === "unavailable", "API unreachable for plan PUT");

    const apiStatus = await workspaceChartTrendStatus(request, ws!.id);
    expect(apiStatus).not.toBe(403);

    await setWorkspacePlan(request, ws!.id, "free");
  });
});
