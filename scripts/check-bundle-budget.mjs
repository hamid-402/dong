#!/usr/bin/env node
/**
 * After `pnpm --filter @dang/web build`, measure client assets under
 * `.next/static` (preferred) or fall back to `.next/standalone`.
 *
 * Budgets (documented in docs/PHASE5.md):
 *   static:     warn 8 MiB / fail 15 MiB  (client chunks)
 *   standalone: warn 20 MiB / fail 25 MiB (includes Node server runtime)
 *
 * Env overrides:
 *   BUNDLE_BUDGET_BYTES / BUNDLE_BUDGET_WARN_BYTES
 *   BUNDLE_BUDGET_ROOT
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const webRoot = resolve(
  process.env.BUNDLE_BUDGET_ROOT ?? join(repoRoot, "apps", "web"),
);

const DEFAULTS = {
  static: { warn: 8 * 1024 * 1024, fail: 15 * 1024 * 1024 },
  standalone: { warn: 20 * 1024 * 1024, fail: 25 * 1024 * 1024 },
};

function dirSizeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += statSync(full).size;
        } catch {
          /* skip */
        }
      }
    }
  }
  return total;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const staticDir = join(webRoot, ".next", "static");
const standalone = join(webRoot, ".next", "standalone");

let kind;
let measuredPath;
let bytes;

if (existsSync(staticDir)) {
  kind = "static";
  measuredPath = staticDir;
  bytes = dirSizeBytes(staticDir);
} else if (existsSync(standalone)) {
  kind = "standalone";
  measuredPath = standalone;
  bytes = dirSizeBytes(standalone);
} else {
  console.error(
    "bundle-budget: no .next/static or .next/standalone found. Run web build first.",
  );
  process.exit(2);
}

const defaults = DEFAULTS[kind];
const FAIL_BYTES = Number(process.env.BUNDLE_BUDGET_BYTES ?? defaults.fail);
const WARN_BYTES = Number(process.env.BUNDLE_BUDGET_WARN_BYTES ?? defaults.warn);

console.log(`bundle-budget: kind=${kind} path=${measuredPath}`);
console.log(`bundle-budget: size=${formatMb(bytes)} (${bytes} bytes)`);
console.log(
  `bundle-budget: warn=${formatMb(WARN_BYTES)} fail=${formatMb(FAIL_BYTES)}`,
);

if (bytes > FAIL_BYTES) {
  console.error(
    `bundle-budget: FAIL — exceeds ${formatMb(FAIL_BYTES)} (documented in docs/PHASE5.md)`,
  );
  process.exit(1);
}

if (bytes > WARN_BYTES) {
  console.warn(
    `bundle-budget: WARN — above ${formatMb(WARN_BYTES)}; still under fail budget`,
  );
}

console.log("bundle-budget: OK");
