#!/usr/bin/env node
/**
 * View line-count budget (dong-50 #42).
 *
 * Keeps `apps/web/src/components/views/*.tsx` from silently ballooning again after
 * the finance-view split. Two thresholds:
 *   - WARN  (> 800 lines):  surfaced in the CI step summary, non-blocking.
 *   - FAIL  (> 1600 lines): hard failure (exit 1).
 *
 * Env overrides:
 *   VIEW_LINE_WARN   (default 800)
 *   VIEW_LINE_FAIL   (default 1600)
 *   VIEW_LINE_DIR    (default apps/web/src/components/views)
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const viewsDir = resolve(
  process.env.VIEW_LINE_DIR ?? join(repoRoot, "apps", "web", "src", "components", "views"),
);

const WARN = Number(process.env.VIEW_LINE_WARN ?? 800);
const FAIL = Number(process.env.VIEW_LINE_FAIL ?? 1600);

function countLines(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  // Count newlines; add 1 when the file does not end in a trailing newline.
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return text.endsWith("\n") ? lines : lines + 1;
}

/** Direct *.tsx files only (panels extracted into subfolders are measured separately). */
function listViewFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    console.error(`view-line-budget: views dir not found: ${dir}`);
    process.exit(2);
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".tsx") &&
        !entry.name.endsWith(".test.tsx") &&
        !entry.name.endsWith(".spec.tsx"),
    )
    .map((entry) => join(dir, entry.name));
}

const files = listViewFiles(viewsDir)
  .map((file) => ({ file, lines: countLines(file), name: file.slice(repoRoot.length + 1) }))
  .sort((a, b) => b.lines - a.lines);

const warnings = files.filter((f) => f.lines > WARN && f.lines <= FAIL);
const failures = files.filter((f) => f.lines > FAIL);

console.log(`view-line-budget: dir=${viewsDir}`);
console.log(`view-line-budget: warn>${WARN} fail>${FAIL} (files=${files.length})`);
for (const f of files) {
  const tag = f.lines > FAIL ? "FAIL" : f.lines > WARN ? "WARN" : "ok";
  console.log(`  [${tag}] ${f.lines}\t${f.name}`);
}

// GitHub step summary (non-blocking warnings + any failures).
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath && (warnings.length > 0 || failures.length > 0)) {
  const lines = ["## View line budget", ""];
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
  console.warn(`::warning::view-line-budget: ${f.name} is ${f.lines} lines (soft limit ${WARN})`);
}

if (failures.length > 0) {
  for (const f of failures) {
    console.error(
      `::error::view-line-budget: ${f.name} is ${f.lines} lines — exceeds hard limit ${FAIL}`,
    );
  }
  process.exit(1);
}

console.log("view-line-budget: OK");
