#!/usr/bin/env node
/**
 * CI Redis + worker heartbeat smoke (Phase 5.3 — deepened).
 * 1) Redis PING + key contract roundtrip
 * 2) Prefer worker `touchHeartbeat()` when @dang/worker source is importable
 *
 * Env: REDIS_URL (required)
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const url = process.env.REDIS_URL?.trim();
if (!url) {
  console.error("REDIS_URL required");
  process.exit(1);
}

const HEARTBEAT_KEY = "dang:worker:heartbeat";
const TTL_SEC = 60;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

async function viaIoredisRoundtrip(stamp) {
  const require = createRequire(path.join(root, "apps/api/package.json"));
  const Redis = require("ioredis");
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== "PONG") throw new Error(`unexpected PING: ${pong}`);
    await client.set(HEARTBEAT_KEY, stamp, "EX", TTL_SEC);
    const got = await client.get(HEARTBEAT_KEY);
    if (got !== stamp) throw new Error("heartbeat key roundtrip failed");
    return client;
  } catch (err) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    throw err;
  }
}

function viaRedisCli(stamp) {
  const parsed = new URL(url);
  const host = parsed.hostname || "127.0.0.1";
  const port = parsed.port || "6379";
  const ping = spawnSync("redis-cli", ["-h", host, "-p", port, "PING"], {
    encoding: "utf8",
  });
  if (ping.status !== 0 || !/PONG/i.test(ping.stdout)) {
    throw new Error(`redis-cli PING failed: ${ping.stderr || ping.stdout}`);
  }
  const set = spawnSync(
    "redis-cli",
    ["-h", host, "-p", port, "SET", HEARTBEAT_KEY, stamp, "EX", String(TTL_SEC)],
    { encoding: "utf8" },
  );
  if (set.status !== 0) throw new Error(set.stderr || "SET failed");
  const get = spawnSync(
    "redis-cli",
    ["-h", host, "-p", port, "GET", HEARTBEAT_KEY],
    { encoding: "utf8" },
  );
  if (get.status !== 0 || get.stdout.trim() !== stamp) {
    throw new Error("heartbeat key roundtrip failed via redis-cli");
  }
}

async function viaWorkerTouchHeartbeat() {
  process.env.REDIS_URL = url;
  const workerRedisPath = path.join(
    root,
    "apps",
    "worker",
    "src",
    "queue",
    "redis-queue.ts",
  );
  const mod = await import(pathToFileURL(workerRedisPath).href);
  if (typeof mod.touchHeartbeat !== "function") {
    throw new Error("touchHeartbeat export missing");
  }
  const ok = await mod.touchHeartbeat(TTL_SEC);
  if (!ok) throw new Error("worker touchHeartbeat returned false");

  const require = createRequire(path.join(root, "apps/api/package.json"));
  const Redis = require("ioredis");
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    const got = await client.get(HEARTBEAT_KEY);
    if (!got) throw new Error("worker heartbeat key missing after touchHeartbeat");
    // Fresh ISO timestamp from worker
    if (Number.isNaN(Date.parse(got))) {
      throw new Error(`worker heartbeat not ISO: ${got}`);
    }
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

try {
  const stamp = new Date().toISOString();
  try {
    const client = await viaIoredisRoundtrip(stamp);
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  } catch (ioredisErr) {
    viaRedisCli(stamp);
    console.warn(
      `ioredis unavailable (${ioredisErr instanceof Error ? ioredisErr.message : ioredisErr}); used redis-cli`,
    );
  }
  console.log(`OK redis contract ping + ${HEARTBEAT_KEY} roundtrip`);

  try {
    await viaWorkerTouchHeartbeat();
    console.log("OK worker touchHeartbeat() wrote live heartbeat key");
  } catch (workerErr) {
    // Still pass contract smoke if worker import path fails in odd layouts;
    // CI installs workspace so this should succeed — fail hard there.
    if (process.env.CI === "true" || process.env.REDIS_WORKER_REQUIRE_TOUCH === "1") {
      throw workerErr;
    }
    console.warn(
      `WARN worker touchHeartbeat skipped: ${workerErr instanceof Error ? workerErr.message : workerErr}`,
    );
  }

  process.exit(0);
} catch (err) {
  console.error(
    `FAIL redis-worker-smoke: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
}
