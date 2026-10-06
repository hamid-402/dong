#!/usr/bin/env node
/**
 * R6 — fail only when ZAP JSON reports High (3) or Critical (4) alerts.
 * Medium/Low stay in the artifact for triage; they must not soft-green the job
 * when High is present, and must not hard-fail when only Medium noise exists.
 *
 * Usage: node scripts/security/zap-fail-on-high.mjs [report.json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? "report_json.json");
if (!existsSync(path)) {
  console.error(`ZAP JSON report missing: ${path}`);
  console.error("Ensure zap-baseline ran with -J report_json.json");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, "utf8"));
const sites = Array.isArray(raw?.site) ? raw.site : raw?.site ? [raw.site] : [];
const alerts = [];
for (const site of sites) {
  const list = site?.alerts;
  if (!Array.isArray(list)) continue;
  for (const a of list) alerts.push(a);
}

const HIGH = 3;
const CRITICAL = 4;
const blockers = alerts.filter((a) => {
  const code = Number(a.riskcode ?? a.riskCode ?? -1);
  return code >= HIGH;
});

if (blockers.length === 0) {
  const medium = alerts.filter((a) => Number(a.riskcode ?? a.riskCode ?? -1) === 2);
  console.log(
    `ZAP High gate: OK (0 High/Critical; ${medium.length} Medium left for triage)`,
  );
  process.exit(0);
}

console.error("ZAP High/Critical alerts (blocking):");
for (const a of blockers) {
  const name = a.name ?? a.alert ?? "unknown";
  const risk = a.riskdesc ?? a.risk ?? a.riskcode;
  const count = a.count ?? a.instances?.length ?? "?";
  console.error(`- [${risk}] ${name} (count=${count})`);
}
process.exit(1);
