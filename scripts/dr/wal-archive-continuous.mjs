#!/usr/bin/env node
/**
 * R10-07 — continuous WAL archive sync to ./.dang/wal-archive (local, no cloud).
 *
 * Modes:
 *   --once     single sync + depth report (default)
 *   --loop     poll every WAL_ARCHIVE_INTERVAL_MS (default 30000)
 *   --switch   also call pg_switch_wal() when DATABASE_URL / docker PITR is up
 *
 * Env:
 *   WAL_ARCHIVE_DIR — default .dang/wal-archive
 *   DR_COMPOSE_FILE — default infra/compose.local.yml
 *   DR_PITR_SERVICE — default postgres-pitr
 *   DATABASE_URL — optional; used for pg_switch_wal
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateWalArchiveDepth, DEFAULT_RPO_MS } from "./wal-rpo-logic.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const archiveDir = resolve(process.env.WAL_ARCHIVE_DIR ?? join(root, ".dang/wal-archive"));
const once = !process.argv.includes("--loop");
const doSwitch = process.argv.includes("--switch");
const intervalMs = Number(process.env.WAL_ARCHIVE_INTERVAL_MS ?? 30_000);

mkdirSync(archiveDir, { recursive: true });

function which(bin) {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [bin], { encoding: "utf8", shell: true });
  return r.status === 0;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...opts,
  });
}

function listArchiveFiles() {
  if (!existsSync(archiveDir)) return [];
  return readdirSync(archiveDir)
    .filter((n) => !n.startsWith(".") && n !== "LATEST.json")
    .map((name) => {
      const st = statSync(join(archiveDir, name));
      return { name, mtimeMs: st.mtimeMs, size: st.size };
    });
}

function syncFromDockerVolume() {
  const composeFile = process.env.DR_COMPOSE_FILE ?? "infra/compose.local.yml";
  const service = process.env.DR_PITR_SERVICE ?? "postgres-pitr";
  if (!which("docker")) {
    return { ok: false, detail: "docker not in PATH" };
  }
  // Copy container /wal_archive into host dir via docker compose cp of a tarball dir.
  const tmp = join(archiveDir, ".docker-pull");
  mkdirSync(tmp, { recursive: true });
  const cp = run(
    "docker",
    ["compose", "-f", composeFile, "cp", `${service}:/wal_archive/.`, `${tmp}/`],
    { cwd: root },
  );
  if (cp.status !== 0) {
    return {
      ok: false,
      detail: cp.stderr || cp.stdout || "docker compose cp failed (is profile pitr up?)",
    };
  }
  let copied = 0;
  for (const name of readdirSync(tmp)) {
    if (name.startsWith(".")) continue;
    const src = join(tmp, name);
    const dest = join(archiveDir, name);
    try {
      copyFileSync(src, dest);
      copied += 1;
    } catch {
      /* skip */
    }
  }
  return { ok: true, method: "docker-compose-cp", copied };
}

function switchWal() {
  const url = process.env.DATABASE_URL?.trim();
  if (url && which("psql")) {
    const r = run("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", "SELECT pg_switch_wal();"]);
    return r.status === 0
      ? { ok: true, method: "psql" }
      : { ok: false, detail: r.stderr || r.stdout };
  }
  const composeFile = process.env.DR_COMPOSE_FILE ?? "infra/compose.local.yml";
  const service = process.env.DR_PITR_SERVICE ?? "postgres-pitr";
  if (!which("docker")) return { ok: false, detail: "no psql/docker for switch" };
  const r = run(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      service,
      "psql",
      "-U",
      "dang",
      "-d",
      "dang",
      "-c",
      "SELECT pg_switch_wal();",
    ],
    { cwd: root },
  );
  return r.status === 0
    ? { ok: true, method: "docker-exec" }
    : { ok: false, detail: r.stderr || r.stdout || "pg_switch_wal failed" };
}

function report(extra = {}) {
  const files = listArchiveFiles();
  const depth = evaluateWalArchiveDepth(files, {
    rpoMs: Number(process.env.DR_RPO_MS ?? DEFAULT_RPO_MS),
  });
  const payload = {
    ok: true,
    archiveDir,
    ...depth,
    files: files.map((f) => f.name),
    ...extra,
    at: new Date().toISOString(),
  };
  writeFileSync(
    join(archiveDir, "LATEST.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

async function tick() {
  const notes = [];
  if (doSwitch) {
    const sw = switchWal();
    notes.push(sw.ok ? `switch:${sw.method}` : `switch_failed:${sw.detail}`);
  }
  // Prefer host bind-mount already writing into archiveDir; still try docker sync.
  const sync = syncFromDockerVolume();
  if (!sync.ok) notes.push(`sync_skipped:${sync.detail}`);
  else notes.push(`sync:${sync.method}:${sync.copied}`);
  // Honest: if archive still empty after sync, depth.available=false
  return report({ notes });
}

async function main() {
  if (once) {
    const payload = await tick();
    // Dry success even when empty — CI uses --dry-run path on timed drill.
    if (process.argv.includes("--require-proven") && !payload.proven) {
      process.exit(1);
    }
    return;
  }
  console.error(`WAL archive loop → ${archiveDir} every ${intervalMs}ms`);
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((err) => {
  console.error("WAL ARCHIVE FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
