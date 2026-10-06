#!/usr/bin/env node
/**
 * OpenAPI-route break check (Phase 5 / R10-10 lite).
 * Fails when a previously inventoried METHOD+path disappears (additive removals only).
 * New routes are allowed. Update baseline intentionally with --write.
 *
 * Usage:
 *   node scripts/contract/openapi-break-check.mjs
 *   node scripts/contract/openapi-break-check.mjs --write
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { collectRouteKeys, ROOT } from "./openapi-route-inventory.mjs";

const baselinePath = path.join(ROOT, "docs", "api", "openapi-routes.baseline.json");
const write = process.argv.includes("--write");

const current = await collectRouteKeys();

if (write) {
  await mkdir(path.dirname(baselinePath), { recursive: true });
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "Static Nest controller inventory — not a full OpenAPI document dump.",
    routes: current,
  };
  await writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${current.length} routes → ${path.relative(ROOT, baselinePath)}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  console.error(
    `Missing baseline at ${path.relative(ROOT, baselinePath)}. Run with --write once.`,
  );
  process.exit(1);
}

const baselineRoutes = new Set(
  Array.isArray(baseline.routes) ? baseline.routes : [],
);
const removed = [...baselineRoutes].filter((key) => !current.includes(key));
const added = current.filter((key) => !baselineRoutes.has(key));

if (removed.length) {
  console.error("OpenAPI route break — removed endpoints:");
  for (const key of removed) console.error(`  - ${key}`);
  console.error(
    "If intentional, update baseline: node scripts/contract/openapi-break-check.mjs --write",
  );
  process.exit(1);
}

console.log(
  `OK openapi-route inventory (${current.length} routes, +${added.length} additive)`,
);
if (added.length && added.length <= 12) {
  for (const key of added) console.log(`  + ${key}`);
}
