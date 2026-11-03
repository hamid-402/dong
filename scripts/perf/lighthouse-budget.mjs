/**
 * Fail a Lighthouse JSON when mobile lab numbers slip past the Dong bar.
 * Budgets are tighter than the v2 handover (JS 1.4MB): LCP < 2.5s, CLS < 0.1,
 * script transfer < 600 KiB. Does not run Lighthouse itself.
 */
import { readFileSync } from "node:fs";

export const BUDGET = {
  lcpMs: 2500,
  cls: 0.1,
  jsBytes: 600 * 1024,
};

export function evaluateLighthouse(report) {
  const audits = report?.audits ?? {};
  const lcp = audits["largest-contentful-paint"]?.numericValue;
  const cls = audits["cumulative-layout-shift"]?.numericValue;
  const requests = audits["network-requests"]?.details?.items ?? [];
  const jsBytes = requests
    .filter((item) => item.resourceType === "Script")
    .reduce((sum, item) => sum + (Number(item.transferSize) || 0), 0);
  const failures = [];
  if (typeof lcp !== "number") failures.push("missing largest-contentful-paint");
  else if (lcp >= BUDGET.lcpMs) failures.push(`LCP ${Math.round(lcp)}ms >= ${BUDGET.lcpMs}ms`);
  if (typeof cls !== "number") failures.push("missing cumulative-layout-shift");
  else if (cls >= BUDGET.cls) failures.push(`CLS ${cls} >= ${BUDGET.cls}`);
  if (jsBytes >= BUDGET.jsBytes) {
    failures.push(`JS ${jsBytes} bytes >= ${BUDGET.jsBytes} bytes`);
  }
  return { lcp, cls, jsBytes, failures };
}

const isDirectRun = process.argv[1]?.endsWith("lighthouse-budget.mjs");
if (isDirectRun) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node scripts/perf/lighthouse-budget.mjs <lighthouse.json>");
    process.exit(2);
  }
  const result = evaluateLighthouse(JSON.parse(readFileSync(path, "utf8")));
  console.log(
    `lighthouse-budget: LCP=${result.lcp == null ? "?" : Math.round(result.lcp)}ms CLS=${result.cls ?? "?"} JS=${result.jsBytes}B`,
  );
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`lighthouse-budget: FAIL ${failure}`);
    process.exit(1);
  }
  console.log("lighthouse-budget: OK");
}
