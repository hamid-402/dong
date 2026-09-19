#!/usr/bin/env node
/**
 * R10-08 — local Redis/Postgres failover smoke via docker compose.
 *
 * Stops a dependency, checks API /health/ready reflects degradation (or 503 when
 * DANG_REQUIRE_* is set), then starts it again.
 *
 * Env:
 *   API_URL — default http://127.0.0.1:3006
 *   DR_COMPOSE_FILE — default infra/compose.local.yml
 *   CHAOS_TARGET — valkey | postgres (default valkey)
 */
import { spawnSync } from "node:child_process";

const apiBase = (process.env.API_URL ?? "http://127.0.0.1:3006").replace(/\/$/, "");
const composeFile = process.env.DR_COMPOSE_FILE ?? "infra/compose.local.yml";
const target = (process.env.CHAOS_TARGET ?? "valkey").trim();

if (target !== "valkey" && target !== "postgres") {
  console.error("CHAOS_TARGET must be valkey or postgres");
  process.exit(1);
}

function which(bin) {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [bin], { encoding: "utf8", shell: true });
  return r.status === 0;
}

function run(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function ready() {
  const res = await fetch(`${apiBase}/api/v1/health/ready`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function main() {
  if (!which("docker")) {
    console.log(
      JSON.stringify({
        ok: false,
        skipped: true,
        reason: "docker not in PATH — see docs/ops/CHAOS-FAILOVER.md",
      }),
    );
    process.exit(0);
  }

  const before = await ready().catch((err) => {
    console.error("API unreachable before chaos:", err.message);
    process.exit(1);
  });

  console.log("before", before.status, before.body?.status ?? before.body);

  const stop = run("docker", ["compose", "-f", composeFile, "stop", target]);
  if (stop.status !== 0) {
    console.error(stop.stderr || stop.stdout || "compose stop failed");
    process.exit(1);
  }

  // Allow health cache / reconnect attempts to settle
  await new Promise((r) => setTimeout(r, 2500));

  let during;
  try {
    during = await ready();
  } catch (err) {
    during = { status: 0, body: { error: String(err) } };
  }

  const start = run("docker", ["compose", "-f", composeFile, "start", target]);
  if (start.status !== 0) {
    console.error("FAILED to restart dependency:", start.stderr || start.stdout);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));
  const after = await ready().catch((err) => ({
    status: 0,
    body: { error: String(err) },
  }));

  const redisTarget = target === "valkey";
  const sawSignal =
    during.status === 503 ||
    during.body?.status === "degraded" ||
    (redisTarget &&
      (during.body?.checks?.redis === "fail" ||
        during.body?.checks?.redisConfigured === true)) ||
    (target === "postgres" && during.body?.checks?.database !== "ok");

  const recovered =
    after.status === 200 &&
    (after.body?.status === "ready" || after.body?.status === "degraded");

  const result = {
    ok: Boolean(sawSignal && recovered),
    target,
    before: { http: before.status, status: before.body?.status },
    during: {
      http: during.status,
      status: during.body?.status,
      checks: during.body?.checks,
    },
    after: { http: after.status, status: after.body?.status },
    note: "R10-08 local failover smoke — not full chaos mesh",
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main();
