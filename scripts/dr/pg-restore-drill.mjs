#!/usr/bin/env node
/**
 * R10-07 — restore drill onto a separate database (default: dang_drill).
 *
 * Creates a fresh dump (unless DR_DUMP_PATH set), restores into drill DB,
 * verifies core schemas/tables, writes a JSON + markdown log under backups/drills/.
 *
 * Env:
 *   DATABASE_URL — admin/migrator URL (database name replaced with drill DB)
 *   DR_DRILL_DB — default dang_drill
 *   DR_DUMP_PATH — optional existing .dump
 *   DR_SKIP_BACKUP — if "1" and DR_DUMP_PATH set, skip fresh backup
 *   API_URL — optional; if set, smoke health/ready after note (does not point API at drill)
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const outDir = resolve(process.env.DR_OUT_DIR ?? join(root, "backups"));
const drillsDir = join(outDir, "drills");
mkdirSync(drillsDir, { recursive: true });

const drillDb = (process.env.DR_DRILL_DB ?? "dang_drill").trim();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...opts,
  });
}

function which(bin) {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [bin], { encoding: "utf8", shell: true });
  return r.status === 0;
}

function rewriteDatabase(url, dbName) {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function adminUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    console.error("DR DRILL FAILED: DATABASE_URL is required for restore drill");
    process.exit(1);
  }
  return raw;
}

function ensureTools() {
  if (!which("psql") || !which("pg_restore") || !which("createdb")) {
    // createdb may be missing; we can CREATE DATABASE via psql
    if (!which("psql") || !which("pg_restore")) {
      console.error(
        "DR DRILL FAILED: need psql and pg_restore in PATH (CI postgres image or local client)",
      );
      process.exit(1);
    }
  }
}

function sql(url, statement, { tuplesOnly = false } = {}) {
  const args = [url, "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-tA");
  args.push("-c", statement);
  const r = run("psql", args);
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `psql failed: ${statement}`);
  }
  return r.stdout;
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`unsafe database name: ${name}`);
  }
  return name;
}

function recreateDrillDb(sourceUrl) {
  const maintenance = rewriteDatabase(sourceUrl, "postgres");
  // Postgres 13+: FORCE disconnects sessions (CI-safe).
  sql(
    maintenance,
    `DROP DATABASE IF EXISTS ${quoteIdent(drillDb)} WITH (FORCE);`,
  );
  sql(maintenance, `CREATE DATABASE ${quoteIdent(drillDb)};`);
}

function restoreDump(dumpPath, drillUrl) {
  const r = run("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    `--dbname=${drillUrl}`,
    dumpPath,
  ]);
  const err = `${r.stderr || ""}\n${r.stdout || ""}`;
  if (r.status !== 0 && /ERROR:/i.test(err)) {
    throw new Error(err);
  }
  if (r.status > 1) {
    throw new Error(err || `pg_restore exit ${r.status}`);
  }
}

function verify(drillUrl) {
  const checks = [];
  for (const name of ["finance", "accounting", "iam", "ops"]) {
    const count = sql(
      drillUrl,
      `SELECT COUNT(*)::int FROM pg_namespace WHERE nspname='${name}';`,
      { tuplesOnly: true },
    ).trim();
    checks.push({ name: `schema.${name}`, ok: count === "1" });
  }
  const required = [
    ["finance", "expense"],
    ["finance", "settlement"],
    ["accounting", "journal_entry"],
    ["iam", "workspace"],
  ];
  for (const [schema, table] of required) {
    const count = sql(
      drillUrl,
      `SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='${schema}' AND table_name='${table}';`,
      { tuplesOnly: true },
    ).trim();
    checks.push({
      name: `table.${schema}.${table}`,
      ok: count === "1",
    });
  }
  const failed = checks.filter((c) => !c.ok);
  return { checks, ok: failed.length === 0 };
}

function parseBackupStdout(stdout) {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.lastIndexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("could not parse backup JSON stdout");
  }
}

function ensureDump() {
  const existing = process.env.DR_DUMP_PATH?.trim();
  if (existing) {
    if (!existsSync(existing)) {
      throw new Error(`DR_DUMP_PATH not found: ${existing}`);
    }
    return existing;
  }
  if (process.env.DR_SKIP_BACKUP === "1") {
    throw new Error("DR_SKIP_BACKUP=1 requires DR_DUMP_PATH");
  }
  const backup = run(process.execPath, [join(__dirname, "pg-backup.mjs")], {
    env: { ...process.env, DR_OUT_DIR: outDir },
    cwd: root,
  });
  if (backup.status !== 0) {
    throw new Error(backup.stderr || backup.stdout || "pg-backup.mjs failed");
  }
  const parsed = parseBackupStdout(backup.stdout);
  if (!parsed.path || !existsSync(parsed.path)) {
    throw new Error("backup succeeded but path missing from output");
  }
  return parsed.path;
}

async function main() {
  ensureTools();
  const sourceUrl = adminUrl();
  const dumpPath = ensureDump();
  recreateDrillDb(sourceUrl);
  const drillUrl = rewriteDatabase(sourceUrl, drillDb);
  restoreDump(dumpPath, drillUrl);
  const verification = verify(drillUrl);

  const result = {
    ok: verification.ok,
    at: new Date().toISOString(),
    drillDb,
    dumpPath,
    checks: verification.checks,
    notes:
      "Logical restore drill (R10-07). Production PITR uses provider WAL/continuous backup — see docs/ops/PITR.md",
  };

  const jsonPath = join(drillsDir, `drill-${stamp}.json`);
  const mdPath = join(drillsDir, `drill-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(
    mdPath,
    `# DR restore drill — ${stamp}

| فیلد | مقدار |
|------|--------|
| ok | ${result.ok} |
| drill DB | \`${drillDb}\` |
| dump | \`${dumpPath}\` |

## Checks

${result.checks.map((c) => `- ${c.ok ? "✅" : "❌"} \`${c.name}\``).join("\n")}

Runbook: \`docs/BACKUP-RESTORE.md\` · PITR: \`docs/ops/PITR.md\`
`,
    "utf8",
  );

  // Latest pointer (committed-friendly template lives in docs; this is local)
  writeFileSync(join(drillsDir, "LATEST.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ...result, jsonPath, mdPath }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error("DR DRILL FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
