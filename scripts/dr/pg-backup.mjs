#!/usr/bin/env node
/**
 * R10-07 — logical Postgres backup (custom format).
 *
 * Env:
 *   DATABASE_URL — preferred (pg_dump)
 *   DR_COMPOSE_FILE — default infra/compose.local.yml (docker fallback)
 *   DR_COMPOSE_SERVICE — default postgres
 *   DR_OUT_DIR — default backups
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.env.DR_OUT_DIR ?? "backups");
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const fileName = `dang-${stamp}.dump`;
const outPath = join(outDir, fileName);

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...opts,
  });
  return result;
}

function which(bin) {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [bin], { encoding: "utf8", shell: true });
  return r.status === 0;
}

function backupWithPgDump(databaseUrl) {
  if (!which("pg_dump")) {
    return { ok: false, detail: "pg_dump not in PATH" };
  }
  const r = run("pg_dump", ["--format=custom", `--file=${outPath}`, databaseUrl]);
  if (r.status !== 0) {
    return { ok: false, detail: r.stderr || r.stdout || `exit ${r.status}` };
  }
  return { ok: true, method: "pg_dump" };
}

function backupWithDocker() {
  const composeFile = process.env.DR_COMPOSE_FILE ?? "infra/compose.local.yml";
  const service = process.env.DR_COMPOSE_SERVICE ?? "postgres";
  if (!which("docker")) {
    return { ok: false, detail: "docker not in PATH" };
  }
  const containerPath = `/tmp/${fileName}`;
  const dump = run("docker", [
    "compose",
    "-f",
    composeFile,
    "exec",
    "-T",
    service,
    "pg_dump",
    "-U",
    "dang",
    "-d",
    "dang",
    "--format=custom",
    "-f",
    containerPath,
  ]);
  if (dump.status !== 0) {
    return {
      ok: false,
      detail: dump.stderr || dump.stdout || "docker compose exec pg_dump failed",
    };
  }
  const cp = run("docker", [
    "compose",
    "-f",
    composeFile,
    "cp",
    `${service}:${containerPath}`,
    outPath,
  ]);
  if (cp.status !== 0) {
    return { ok: false, detail: cp.stderr || cp.stdout || "docker compose cp failed" };
  }
  return { ok: true, method: "docker-compose" };
}

const databaseUrl = process.env.DATABASE_URL?.trim();
let result = { ok: false, detail: "no method" };

if (databaseUrl) {
  result = backupWithPgDump(databaseUrl);
  if (!result.ok) {
    console.warn(`pg_dump path failed (${result.detail}); trying docker…`);
    result = backupWithDocker();
  }
} else {
  result = backupWithDocker();
}

if (!result.ok) {
  console.error("DR BACKUP FAILED:", result.detail);
  console.error(
    "Set DATABASE_URL with pg_dump in PATH, or run local compose postgres + docker.",
  );
  process.exit(1);
}

if (!existsSync(outPath)) {
  console.error("DR BACKUP FAILED: output file missing", outPath);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      method: result.method,
      path: outPath,
      fileName,
    },
    null,
    2,
  ),
);
