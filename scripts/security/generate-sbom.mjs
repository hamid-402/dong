#!/usr/bin/env node
/**
 * Generate a CycloneDX-ish SBOM from the workspace lockfile / package graph (Phase 5).
 * Honest: unsigned, not provenance-attested — artifact for triage, not a compliance claim.
 *
 * Usage: node scripts/security/generate-sbom.mjs [--out path]
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const outIdx = process.argv.indexOf("--out");
const outPath =
  outIdx >= 0 && process.argv[outIdx + 1]
    ? path.resolve(process.argv[outIdx + 1])
    : path.join(root, "artifacts", "sbom.cdx.json");

const listed = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["list", "-r", "--depth", "Infinity", "--json"],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  },
);

if (listed.status !== 0) {
  console.error(listed.stderr || listed.stdout || "pnpm list failed");
  process.exit(listed.status ?? 1);
}

/** @type {unknown} */
let parsed;
try {
  parsed = JSON.parse(listed.stdout);
} catch (err) {
  console.error("Failed to parse pnpm list JSON", err);
  process.exit(1);
}

const packages = Array.isArray(parsed) ? parsed : [parsed];
const components = [];
const seen = new Set();

function walkDeps(node, parentName) {
  if (!node || typeof node !== "object") return;
  const name = typeof node.name === "string" ? node.name : parentName;
  const version = typeof node.version === "string" ? node.version : null;
  if (name && version) {
    const key = `${name}@${version}`;
    if (!seen.has(key)) {
      seen.add(key);
      components.push({
        type: "library",
        name,
        version,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      });
    }
  }
  const deps = node.dependencies;
  if (deps && typeof deps === "object") {
    for (const [depName, depNode] of Object.entries(deps)) {
      walkDeps(
        typeof depNode === "object" && depNode
          ? { ...depNode, name: depNode.name ?? depName }
          : { name: depName, version: String(depNode) },
        depName,
      );
    }
  }
}

for (const pkg of packages) {
  walkDeps(pkg, pkg?.name);
}

components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ name: "dang-generate-sbom", version: "0.1.0" }],
    component: {
      type: "application",
      name: "dang-hamkari",
      version: "0.1.0",
    },
    properties: [
      {
        name: "dang:sbom:honesty",
        value: "unsigned_workspace_graph_not_attested",
      },
    ],
  },
  components,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(bom, null, 2)}\n`, "utf8");
console.log(
  `Wrote SBOM ${components.length} components → ${path.relative(root, outPath)}`,
);
