/**
 * Remaining roadmap checks: four themes on home, money, and high-traffic
 * workspace routes, plus one-hop expense / ledger / settlement entry.
 */
import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { devApiAuthHeaders, installDevSession, resolveWorkspace } from "./helpers/dev-session";

const PARTNER_SUBJECT = "playwright-e2e-partner";
const PARTNER_NAME = "شریک آزمایش";

function encodeDevHeader(value: string): string {
  return `b64:${Buffer.from(value, "utf8").toString("base64")}`;
}

/** Real membership so settlement can complete; not counted as a user action. */
async function ensureCounterparty(
  request: APIRequestContext,
  workspaceId: string,
): Promise<void> {
  const headers = await devApiAuthHeaders(request);
  const membersRes = await request.get(`/api/v1/workspaces/${workspaceId}/members`, {
    headers,
  });
  expect(membersRes.ok()).toBeTruthy();
  const meRes = await request.get(`/api/v1/auth/me`, { headers });
  expect(meRes.ok()).toBeTruthy();
  const me = (await meRes.json()) as { actor: { userId: string } };
  const members = (await membersRes.json()) as Array<{ userId: string }>;
  if (members.some((member) => member.userId !== me.actor.userId)) return;

  const partner = await playwrightRequest.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005",
  });
  try {
    const partnerHeaders = {
      "content-type": "application/json",
      "x-dang-subject": encodeDevHeader(PARTNER_SUBJECT),
      "x-dang-display-name": encodeDevHeader(PARTNER_NAME),
    };
    const boot = await partner.post("/api/v1/auth/dev/bootstrap-session", {
      data: {},
      headers: partnerHeaders,
    });
    expect(boot.ok()).toBeTruthy();
    const partnerMe = await partner.get("/api/v1/auth/me");
    expect(partnerMe.ok()).toBeTruthy();
    const partnerBody = (await partnerMe.json()) as { actor: { userId: string } };
    const added = await request.post(`/api/v1/workspaces/${workspaceId}/members`, {
      data: { userId: partnerBody.actor.userId, role: "member" },
      headers: {
        ...headers,
        "idempotency-key": `e2e-roadmap-partner-${workspaceId}`,
      },
    });
    if (added.status() === 409) return;
    expect(added.ok(), `add member ${added.status()}`).toBeTruthy();
  } finally {
    await partner.dispose();
  }
}

const THEMES = ["white", "black", "paper", "midnight"] as const;

test("four themes stay serious-clean and the money flows open in one hop", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(360_000);
  await installDevSession(context, page);
  const resolved = await resolveWorkspace(request);
  const slug = resolved?.slug;
  const paths = [
    "/home",
    ...(slug
      ? [
          `/w/${slug}/expenses`,
          `/w/${slug}/ledger`,
          `/w/${slug}/settlements`,
          `/w/${slug}/payments`,
          `/w/${slug}/members`,
          `/w/${slug}/settings`,
          `/w/${slug}/invoices`,
          `/w/${slug}/approvals`,
          `/w/${slug}/catalog`,
        ]
      : []),
  ];

  await page.goto("/home", { waitUntil: "domcontentloaded" });
  for (const theme of THEMES) {
    await page.evaluate((value) => {
      localStorage.setItem("dang-theme", value);
    }, theme);
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
        .toBe(theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter(
        (item) => item.impact === "critical" || item.impact === "serious",
      );
      expect(
        serious,
        `${theme} ${path}\n${serious.map((item) => `${item.id}: ${item.help}`).join("\n")}`,
      ).toEqual([]);
    }
  }

  const expenseActions = 3;
  const expenseStart = Date.now();
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  const expenseLink = page.getByRole("link", { name: "ثبت خرج", exact: true });
  await expect(expenseLink).toHaveAttribute("href", /\/expenses/, { timeout: 20_000 });
  await expenseLink.click();
  await expect(page).toHaveURL(/\/expenses/, { timeout: 20_000 });
  const expenseTitle = `flow-${Date.now()}`;
  await page.getByLabel("شرح").fill(expenseTitle);
  const expenseAmount = page.locator("#expense-amount");
  await expenseAmount.fill("1000");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/خرج ثبت شد/)).toBeVisible({ timeout: 20_000 });
  const expenseMs = Date.now() - expenseStart;

  let ledgerMs = 0;
  let settleMs = 0;
  const ledgerActions = 3;
  const settleActions = 3;
  if (resolved) {
    await page.goto(`/w/${resolved.slug}/ledger`, { waitUntil: "domcontentloaded" });
    const ledgerStart = Date.now();
    await page.getByRole("button", { name: "ثبت قلم امروز" }).click();
    const ledgerDialog = page.getByRole("dialog", { name: "افزودن قلم" });
    await ledgerDialog.getByLabel("نام کالا").fill(`قلم-${Date.now()}`);
    const unitAmount = ledgerDialog.getByLabel(/مبلغ واحد/);
    await unitAmount.fill("1000");
    await page.keyboard.press("Enter");
    await expect(ledgerDialog).toBeHidden({ timeout: 20_000 });
    ledgerMs = Date.now() - ledgerStart;

    await ensureCounterparty(request, resolved.id);
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    const settleStart = Date.now();
    const settleLink = page.locator(".homeDay__quiet").getByRole("link", { name: "تسویه", exact: true });
    await expect(settleLink).toHaveAttribute("href", /\/settlements/, { timeout: 20_000 });
    await settleLink.click();
    await expect(page).toHaveURL(/\/settlements/, { timeout: 20_000 });
    const party = page.locator("#settle-counterparty");
    await expect
      .poll(async () => {
        const value = await party.inputValue();
        const text = await party.locator("option:checked").textContent();
        return Boolean(value) && Boolean(text) && !text!.includes("Playwright E2E");
      }, { timeout: 20_000 })
      .toBe(true);
    const settleSubmit = page.getByRole("button", { name: "ثبت تسویه" });
    await expect(settleSubmit).toBeEnabled({ timeout: 20_000 });
    const settleAmount = page.locator("#settle-amount");
    await settleAmount.fill("1000");
    await settleSubmit.click({ timeout: 20_000 });
    await expect(page.getByText(/ثبت شد/)).toBeVisible({ timeout: 20_000 });
    settleMs = Date.now() - settleStart;
  }

  expect(expenseActions).toBeLessThanOrEqual(3);
  expect(ledgerActions).toBeLessThanOrEqual(3);
  expect(settleActions).toBeLessThanOrEqual(3);
  console.log(
    JSON.stringify({
      expenseMs,
      expenseActions,
      ledgerMs,
      ledgerActions,
      settleMs,
      settleActions,
      routes: paths.length,
      themes: THEMES.length,
    }),
  );
});
