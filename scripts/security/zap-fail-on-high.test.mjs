/**
 * Unit parse tests for zap-fail-on-high.mjs (no live ZAP / no staging).
 * RES-03 residual: blocker — ZAP_TARGET_URL staging is not available.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "scripts/security/zap-fail-on-high.mjs");

function runGate(report) {
  const dir = mkdtempSync(join(tmpdir(), "zap-gate-"));
  const path = join(dir, "report.json");
  writeFileSync(path, JSON.stringify(report), "utf8");
  try {
    const result = spawnSync(process.execPath, [script, path], {
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ZAP High gate: High riskcode → non-zero exit", () => {
  const result = runGate({
    site: [
      {
        alerts: [
          { name: "SQL Injection", riskcode: "3", riskdesc: "High", count: "1" },
        ],
      },
    ],
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SQL Injection|High/i);
});

test("ZAP High gate: no High/Critical → exit 0", () => {
  const result = runGate({
    site: [
      {
        alerts: [
          { name: "Info leak", riskcode: "1", riskdesc: "Low", count: "2" },
          { name: "Cookie", riskcode: "2", riskdesc: "Medium", count: "1" },
        ],
      },
    ],
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK/);
});

test("ZAP High gate: Critical riskcode → non-zero exit", () => {
  const result = runGate({
    site: {
      alerts: [{ name: "RCE", riskcode: 4, riskdesc: "Critical", count: 1 }],
    },
  });
  assert.notEqual(result.status, 0);
});
