/**
 * Remaining roadmap checks: four themes on home, money, and high-traffic
 * workspace routes, plus one-hop expense / ledger / settlement entry.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installDevSession, resolveWorkspaceSlug } from "./helpers/dev-session";

const THEMES = ["white", "black", "paper", "midnight"] as const;

test("four themes stay serious-clean and the money flows open in one hop", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(300_000);
  await installDevSession(context, page);
  const resolved = await resolveWorkspaceSlug(request);
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

  const expenseStart = Date.now();
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  const expenseLink = page.getByRole("link", { name: "ثبت خرج", exact: true });
  await expect(expenseLink).toHaveAttribute("href", /\/expenses/, { timeout: 20_000 });
  await expenseLink.click();
  await expect(page).toHaveURL(/\/expenses/, { timeout: 20_000 });
  await expect(page.getByLabel("شرح")).toBeVisible({ timeout: 20_000 });
  const expenseMs = Date.now() - expenseStart;

  let ledgerMs = 0;
  let settleMs = 0;
  if (slug) {
    const ledgerStart = Date.now();
    await page.goto(`/w/${slug}/ledger`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /ثبت قلم امروز|امروز را باز کن|ثبت قلم/ }),
    ).toBeVisible({ timeout: 20_000 });
    ledgerMs = Date.now() - ledgerStart;

    const settleStart = Date.now();
    await page.goto(`/w/${slug}/settlements`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("جزئیات تسویه")).toBeVisible({ timeout: 20_000 });
    settleMs = Date.now() - settleStart;
  }

  console.log(
    JSON.stringify({
      expenseHopMs: expenseMs,
      ledgerOpenMs: ledgerMs,
      settlementOpenMs: settleMs,
      routes: paths.length,
      themes: THEMES.length,
    }),
  );
});
