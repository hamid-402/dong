import { isRedisConfigured, loadAppEnv, type AppEnv } from "@dang/config";
import { createDatabase, sql } from "@dang/db";
import { getRedisClient } from "../jobs/redis-queue.js";

export type ReadinessChecks = {
  iam: "memory" | "postgres";
  requirePostgres: boolean;
  databaseConfigured: boolean;
  database: "ok" | "skip" | "fail";
  redisConfigured: boolean;
  redis: "ok" | "skip" | "fail";
};

export type ReadinessSnapshot = {
  status: "ready" | "degraded";
  checks: ReadinessChecks;
};

let dbPingCache: { at: number; result: "ok" | "fail" } | null = null;

async function pingDatabase(
  databaseUrl: string | undefined,
): Promise<"ok" | "skip" | "fail"> {
  if (!databaseUrl) return "skip";
  const now = Date.now();
  if (dbPingCache && now - dbPingCache.at < 2000) {
    return dbPingCache.result;
  }
  try {
    const database = createDatabase(databaseUrl);
    await database.db.execute(sql`select 1`);
    dbPingCache = { at: now, result: "ok" };
    return "ok";
  } catch {
    dbPingCache = { at: now, result: "fail" };
    return "fail";
  }
}

async function pingRedis(redisConfigured: boolean): Promise<"ok" | "skip" | "fail"> {
  if (!redisConfigured) return "skip";
  try {
    const redis = await getRedisClient();
    if (!redis) return "fail";
    const pong = await redis.ping();
    return pong === "PONG" ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

/**
 * Shared readiness evaluation used by /health/ready and /system/capabilities.
 */
export async function evaluateReadiness(input: {
  iamPersistence: "memory" | "postgres";
  env?: AppEnv;
}): Promise<ReadinessSnapshot> {
  const env = input.env ?? loadAppEnv();
  const databaseConfigured = Boolean(env.databaseUrl);
  const redisConfigured = isRedisConfigured(env);
  const requirePg = process.env.DANG_REQUIRE_POSTGRES === "1";
  const requireRedis = process.env.DANG_REQUIRE_REDIS === "1";

  const [database, redis] = await Promise.all([
    pingDatabase(env.databaseUrl),
    pingRedis(redisConfigured),
  ]);

  const degraded =
    (requirePg && database !== "ok") ||
    (requirePg && input.iamPersistence === "memory") ||
    (requireRedis && redis !== "ok") ||
    (databaseConfigured && database === "fail") ||
    (redisConfigured && redis === "fail");

  return {
    status: degraded ? "degraded" : "ready",
    checks: {
      iam: input.iamPersistence,
      requirePostgres: requirePg,
      databaseConfigured,
      database,
      redisConfigured,
      redis,
    },
  };
}
