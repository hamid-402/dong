#!/usr/bin/env node
/**
 * R10-07 — timed local PITR/RPO drill (no cloud).
 *
 * --dry-run  CI-friendly: evaluate fixture/archive math + optional logical restore skip
 * Default: sync WAL archive, optionally restore logical dump (DR_DUMP_PATH), prove RPO.
 *
 * Env:
 *   WAL_ARCHIVE_DIR — default .dang/wal-archive
 *   DR_RPO_MS — default 300000 (5m)
 *   DR_DUMP_PATH — optional dump for logical verify leg
 *   DATABASE_URL — required for non-dry restore leg
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RPO_MS,
  evaluateTimedRestoreDrill,
  evaluateWalArchiveDepth,
} from "./wal-rpo-logic.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const archiveDir = resolve(process.env.WAL_ARCHIVE_DIR ?? join(root, ".dang/wal-archive"));
const drillsDir = resolve(process.env.DR_OUT_DIR ?? join(root, "backups"), "drills");
const dryRun = process.argv.includes("--dry-run");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

mkdirSync(archiveDir, { recursive: true });
mkdirSync(drillsDir, { recursive: true });

function listArchiveFiles() {
  if (!existsSync(archiveDir)) return [];
  return readdirSync(archiveDir)
    .filter((n) => !n.startsWith(".") && n !== "LATEST.json")
    .map((name) => {
      const st = statSync(join(archiveDir, name));
      return { name, mtimeMs: st.mtimeMs };
    });
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    cwd: root,
    ...opts,
  });
}

function dryFixtureArchive() {
  // Synthetic files prove math path in CI without Postgres.
  const now = Date.now();
  return [
    { name: "fixture-0001", mtimeMs: now - 45_000 },
    { name: "fixture-0002", mtimeMs: now - 15_000 },
  ];
}

async function main() {
  const rpoMs = Number(process.env.DR_RPO_MS ?? DEFAULT_RPO_MS);
  let files = listArchiveFiles();
  let mode = "live-archive";

  if (dryRun) {
    mode = "dry-run-fixture";
    // Prefer real archive if present; else fixture.
    if (files.length === 0) files = dryFixtureArchive();
  } else {
    // Best-effort sync
    run(process.execPath, [join(__dirname, "wal-archive-continuous.mjs"), "--once"], {
      env: process.env,
    });
    files = listArchiveFiles();
  }

  const archiveEval = evaluateWalArchiveDepth(files, {
    nowMs: Date.now(),
    rpoMs,
  });

  const restoreStartedMs = Date.now();
  let verifyOk = dryRun ? archiveEval.available : false;

  if (!dryRun && process.env.DATABASE_URL?.trim()) {
    const drill = run(process.execPath, [join(__dirname, "pg-restore-drill.mjs")], {
      env: {
        ...process.env,
        DR_SKIP_BACKUP: process.env.DR_DUMP_PATH ? "1" : undefined,
      },
    });
    verifyOk = drill.status === 0;
  } else if (!dryRun) {
    // No DB: document-only path — RPO math still reported; verifyOk false honestly.
    verifyOk = false;
  }

  const restoreFinishedMs = Date.now();
  const result = evaluateTimedRestoreDrill({
    archiveEval,
    restoreStartedMs,
    restoreFinishedMs,
    verifyOk,
  });

  const payload = {
    ...result,
    mode,
    dryRun,
    archiveDir,
    at: new Date().toISOString(),
    notes: dryRun
      ? [
          "CI dry-run: RPO math from fixture or local archive; no cloud PITR",
          "Full docker PITR: compose --profile pitr + pnpm dr:wal:archive --switch",
        ]
      : [
          "Local timed drill; cloud PITR still out of scope",
          verifyOk ? "logical restore leg green" : "logical restore skipped or failed",
        ],
  };

  const jsonPath = join(drillsDir, `pitr-timed-${stamp}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(
    join(drillsDir, "PITR-LATEST.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ ...payload, jsonPath }, null, 2));

  // Dry-run exits 0 when math path works (fixture/archive available).
  if (dryRun) {
    if (!archiveEval.available) process.exit(1);
    process.exit(0);
  }
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("PITR TIMED DRILL FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
