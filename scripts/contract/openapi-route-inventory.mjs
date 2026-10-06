#!/usr/bin/env node
/**
 * Static OpenAPI-ish route inventory from Nest controllers.
 * Used for breaking-change checks without booting the API (honest, additive).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
const apiSrc = path.join(ROOT, "apps", "api", "src");

const METHOD_RE =
  /@(Get|Post|Put|Patch|Delete|Head|Options)\((?:'([^']*)'|"([^"]*)")?\)/g;
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

/** @returns {Promise<string[]>} sorted `METHOD path` keys */
export async function collectRouteKeys() {
  const files = await walk(apiSrc);
  const keys = new Set();
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const ctrl = text.match(CONTROLLER_RE);
    const base = ctrl?.[1] ?? ctrl?.[2] ?? "";
    let match;
    METHOD_RE.lastIndex = 0;
    while ((match = METHOD_RE.exec(text)) !== null) {
      const method = match[1].toUpperCase();
      const route = match[2] ?? match[3] ?? "";
      keys.add(`${method} ${normalizeJoin(base, route)}`);
    }
  }
  return [...keys].sort();
}
