#!/usr/bin/env node
/**
 * Attack-surface inventory from Nest controller decorators (R10-22 prep).
 * Honest static scan — not a live crawler and not a pen-test result.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const apiSrc = path.join(root, "apps", "api", "src");
const outDir = path.join(root, "docs", "security", "generated");
const outFile = path.join(outDir, "ATTACK-SURFACE.md");

const METHOD_RE = /@(Get|Post|Put|Patch|Delete|Head|Options)\((?:'([^']*)'|"([^"]*)")?\)/g;
const CONTROLLER_RE = /@Controller\((?:'([^']*)'|"([^"]*)")?\)/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      files.push(full);
    }
  }
  return files;
}

function normalizeJoin(base, route) {
  const b = (base ?? "").replace(/^\/+|\/+$/g, "");
  const r = (route ?? "").replace(/^\/+|\/+$/g, "");
  if (!b && !r) return "/api/v1";
  if (!b) return `/api/v1/${r}`;
  if (!r) return `/api/v1/${b}`;
  return `/api/v1/${b}/${r}`;
}

const files = await walk(apiSrc);
const rows = [];

for (const file of files.sort()) {
  const text = await readFile(file, "utf8");
  const ctrl = text.match(CONTROLLER_RE);
  const base = ctrl?.[1] ?? ctrl?.[2] ?? "";
  let match;
  METHOD_RE.lastIndex = 0;
  while ((match = METHOD_RE.exec(text)) !== null) {
    const method = match[1].toUpperCase();
    const route = match[2] ?? match[3] ?? "";
    rows.push({
      method,
      path: normalizeJoin(base, route),
      file: path.relative(root, file).replaceAll("\\", "/"),
    });
  }
}

rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const generatedAt = new Date().toISOString();
const lines = [
  "# Attack surface inventory (generated)",
  "",
  `Generated: ${generatedAt}`,
  "",
  "Source: static scan of `*.controller.ts` under `apps/api/src`.",
  "This is **not** a penetration-test report and does not prove authorization correctness.",
  "",
  `| # | Method | Path | Controller file |`,
  `|---|--------|------|-----------------|`,
  ...rows.map(
    (r, i) => `| ${i + 1} | \`${r.method}\` | \`${r.path}\` | \`${r.file}\` |`,
  ),
  "",
  `Total routes: **${rows.length}**`,
  "",
];

await mkdir(outDir, { recursive: true });
await writeFile(outFile, lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} routes → ${path.relative(root, outFile)}`);
