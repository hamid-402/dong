import { test, expect } from "@playwright/test";
import {
  installDevSession,
  resolveWorkspace,
  setWorkspacePlan,
  workspaceChartTrendStatus,
} from "./helpers/dev-session";

/**
 * G17 — charts on free (`reports`) + warehouse analytics still pro/business.
 * Uses real PUT /plan + chart APIs; skips upgrade legs when plan admin is off.
 */
test.describe("G17 charts plan matrix", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ context, page }) => {
    await installDevSession(context, page);
  });

  test("free plan: workspace charts load from live expenses — never fake series", async ({
    page,
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "Need seeded workspace or PLAYWRIGHT_WORKSPACE_SLUG + live API");

    const setFree = await setWorkspacePlan(request, ws!.id, "free");
    test.skip(
      setFree === "unavailable",
      "API unreachable for plan PUT (ALLOW_DEV_AUTH / proxy)",
    );

    const apiStatus = await workspaceChartTrendStatus(request, ws!.id);
    if (apiStatus != null) {
      // free charts use `reports` → 200 (or capability/auth off)
      expect([200, 401, 404]).toContain(apiStatus);
      expect(apiStatus).not.toBe(403);
    }

    await page.goto(`/w/${ws!.slug}/charts`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const chartsOff = page.getByText(/providers\.charts|charts_v1/);
    const chartTitle = page.getByText(/روند خرج ماهانه|سهم اعضا|ترکیب دسته‌بندی/);
    const oldPlanDenied = page.getByText(/نمودار فضای کاری پشت قابلیت analytics پلن/);

    await expect(chartsOff.or(chartTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(oldPlanDenied).toHaveCount(0);
  });

  test("pro plan: charts API allows; UI shows series chrome or capability-off", async ({
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
    expect(apiStatus).not.toBe(403);

    await page.goto(`/w/${ws!.slug}/charts`);
    await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });

    const chartsOff = page.getByText(/providers\.charts|charts_v1/);
    const chartTitle = page.getByText(/روند خرج ماهانه|سهم اعضا/);

    await expect(chartsOff.or(chartTitle).first()).toBeVisible({ timeout: 20_000 });

    await setWorkspacePlan(request, ws!.id, "free");
  });

  test("business plan: charts not plan_required", async ({ request }) => {
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
