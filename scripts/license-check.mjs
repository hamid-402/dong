#!/usr/bin/env node
/**
 * Lightweight license gate: `pnpm licenses list --json` and fail on GPL-only
 * (or AGPL/LGPL-only) packages. Dual-licensed packages that also offer MIT/Apache
 * etc. are allowed.
 *
 * Documented in docs/PHASE5.md. Run: `pnpm license:check`
 */
import { spawnSync } from "node:child_process";

const FORBIDDEN_SOLO = [
  /^gpl(\s|-|$)/i,
  /^agpl(\s|-|$)/i,
  /^lgpl(\s|-|$)/i,
];

const PERMISSIVE_HINT =
  /\b(mit|apache|bsd|isc|0bsd|unlicense|cc0|mpl|blueoak|python|postgresql|zlib|boost|artistic|wtfpl)\b/i;

function normalizeLicense(raw) {
  if (!raw) return "";
  if (Array.isArray(raw)) return raw.map(String).join(" OR ");
  return String(raw);
}

function isForbiddenSolo(licenseText) {
  const text = normalizeLicense(licenseText).trim();
  if (!text || text === "Unknown") return false;
  // Dual / OR with a permissive side → allow
  if (/\sOR\s|\|/i.test(text) && PERMISSIVE_HINT.test(text)) {
    return false;
  }
  // Explicit dual like "GPL-2.0 OR MIT"
  if (PERMISSIVE_HINT.test(text) && !/^(l?gpl|agpl)/i.test(text.split(/\sOR\s|\|/i)[0] ?? "")) {
    return false;
  }
  if (PERMISSIVE_HINT.test(text) && /OR/i.test(text)) return false;

  const lower = text.toLowerCase();
  // GPL-only (no permissive alternative mentioned)
  if (FORBIDDEN_SOLO.some((re) => re.test(lower))) {
    if (PERMISSIVE_HINT.test(text) && /or/i.test(text)) return false;
    return true;
  }
  return false;
}

function collectPackages(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.name && (node.license || node.licenses)) {
    out.push({
      name: node.name,
      version: node.version ?? "",
      license: node.license ?? node.licenses,
      path: node.path ?? "",
    });
  }
  // pnpm licenses list --json shapes vary by version
  if (Array.isArray(node)) {
    for (const item of node) collectPackages(item, out);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "name" || key === "version" || key === "license" || key === "licenses" || key === "path") {
      continue;
    }
    if (value && typeof value === "object") collectPackages(value, out);
  }
  return out;
}

/** Alternate pnpm shape: { "MIT": [ {name,versions,...} ], ... } */
function collectFromLicenseMap(data) {
  const out = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [license, packages] of Object.entries(data)) {
    if (!Array.isArray(packages)) continue;
    for (const pkg of packages) {
      const name = pkg.name ?? pkg;
      const versions = pkg.versions ?? (pkg.version ? [pkg.version] : []);
      out.push({
        name: typeof name === "string" ? name : String(name),
        version: Array.isArray(versions) ? versions.join(",") : String(versions ?? ""),
        license,
        path: "",
      });
    }
  }
  return out;
}

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["licenses", "list", "--json"],
  {
    encoding: "utf8",
    // Windows needs a shell to resolve pnpm.cmd; Unix can use shell:false.
    shell: process.platform === "win32",
    maxBuffer: 32 * 1024 * 1024,
  },
);

if (result.status !== 0) {
  console.error("license-check: `pnpm licenses list --json` failed");
  console.error(result.stderr || result.stdout);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(result.stdout || "{}");
} catch (err) {
  console.error("license-check: failed to parse pnpm licenses JSON");
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
}

let packages = collectFromLicenseMap(data);
if (packages.length === 0) {
  packages = collectPackages(data);
}

const offenders = packages.filter((p) => isForbiddenSolo(p.license));

if (offenders.length) {
  console.error("license-check: FAIL — GPL/AGPL/LGPL-only packages found:");
  for (const p of offenders.slice(0, 50)) {
    console.error(`  - ${p.name}@${p.version}: ${normalizeLicense(p.license)}`);
  }
  if (offenders.length > 50) {
    console.error(`  … and ${offenders.length - 50} more`);
  }
  process.exit(1);
}

console.log(
  `license-check: OK (${packages.length} license entries scanned; no GPL-only packages)`,
);
