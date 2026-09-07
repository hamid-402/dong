#!/usr/bin/env node
/**
 * Component line-count budget (Dong 2.0 Law 5 / roadmap).
 *
 * Scope: all TSX under apps/web/src/components (recursive, not only views/).
 * Thresholds:
 *   - WARN  (> 800 lines): CI warning / step summary, non-blocking.
 *   - FAIL  (> 1600 lines): hard failure (exit 1).
 *
 * Env overrides:
 *   VIEW_LINE_WARN   (default 800)
 *   VIEW_LINE_FAIL   (default 1600)
 *   VIEW_LINE_DIR    (default apps/web/src/components) — recursive
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const componentsDir = resolve(
  process.env.VIEW_LINE_DIR ?? join(repoRoot, "apps", "web", "src", "components"),
);

const WARN = Number(process.env.VIEW_LINE_WARN ?? 800);
const FAIL = Number(process.env.VIEW_LINE_FAIL ?? 1600);

function countLines(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return text.endsWith("\n") ? lines : lines + 1;
}

/** Recursive *.tsx under components (skip tests). */
function listComponentFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    console.error(`component-line-budget: dir not found: ${dir}`);
    process.exit(2);
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listComponentFiles(full, acc);
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".spec.tsx")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

try {
  if (!statSync(componentsDir).isDirectory()) {
    console.error(`component-line-budget: not a directory: ${componentsDir}`);
    process.exit(2);
  }
} catch {
  console.error(`component-line-budget: dir not found: ${componentsDir}`);
  process.exit(2);
}

const files = listComponentFiles(componentsDir)
  .map((file) => ({ file, lines: countLines(file), name: file.slice(repoRoot.length + 1) }))
  .sort((a, b) => b.lines - a.lines);

const warnings = files.filter((f) => f.lines > WARN && f.lines <= FAIL);
const failures = files.filter((f) => f.lines > FAIL);

console.log(`component-line-budget: scope=apps/web/src/components/** (recursive)`);
console.log(`component-line-budget: dir=${componentsDir}`);
console.log(`component-line-budget: warn>${WARN} fail>${FAIL} (files=${files.length})`);
for (const f of files) {
  const tag = f.lines > FAIL ? "FAIL" : f.lines > WARN ? "WARN" : "ok";
  console.log(`  [${tag}] ${f.lines}\t${f.name}`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath && (warnings.length > 0 || failures.length > 0)) {
  const lines = ["## Component line budget (`components/**`)", ""];
  if (failures.length > 0) {
    lines.push(`### ❌ Over hard limit (> ${FAIL} lines)`);
    for (const f of failures) lines.push(`- \`${f.name}\` — ${f.lines} lines`);
    lines.push("");
  }
  if (warnings.length > 0) {
    lines.push(`### ⚠️ Above soft limit (> ${WARN} lines) — consider splitting`);
    for (const f of warnings) lines.push(`- \`${f.name}\` — ${f.lines} lines`);
    lines.push("");
  }
  try {
    appendFileSync(summaryPath, `${lines.join("\n")}\n`);
  } catch {
    /* summary is best-effort */
  }
}

for (const f of warnings) {
  console.warn(`::warning::component-line-budget: ${f.name} is ${f.lines} lines (soft limit ${WARN})`);
}

if (failures.length > 0) {
  for (const f of failures) {
    console.error(
      `::error::component-line-budget: ${f.name} is ${f.lines} lines — exceeds hard limit ${FAIL}`,
    );
  }
  process.exit(1);
}

console.log("component-line-budget: OK");
