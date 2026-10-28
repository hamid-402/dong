import { isRedisConfigured, loadAppEnv, type AppEnv } from "@dang/config";
import { createDatabase, sql } from "@dang/db";
import { getRedisClient } from "../jobs/redis-queue.js";
import {
  evaluateDbRoleCheck,
  isDbRoleStrict,
  logDbRoleCheck,
  probeDbRole,
  type DbRoleCheckStatus,
  type DbRoleProbeRow,
} from "./db-role-probe.js";

export type ReadinessChecks = {
  iam: "memory" | "postgres";
  requirePostgres: boolean;
  databaseConfigured: boolean;
  database: "ok" | "skip" | "fail";
  redisConfigured: boolean;
  redis: "ok" | "skip" | "fail";
  /** App DB role probe (dang_runtime / NOBYPASSRLS). */
  dbRole: DbRoleCheckStatus;
  dbRoleStrict: boolean;
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
  /** Injected probe for unit tests (no live Postgres). */
  dbRoleProbe?: DbRoleProbeRow | null;
  /** When true, skip live probe even if DATABASE_URL is set. */
  skipLiveDbRoleProbe?: boolean;
  /** When true, treat DB ping as ok/skip without connecting (unit tests). */
  skipLiveDatabasePing?: boolean;
}): Promise<ReadinessSnapshot> {
  const env = input.env ?? loadAppEnv();
  const databaseConfigured = Boolean(env.databaseUrl);
  const redisConfigured = isRedisConfigured(env);
  const requirePg = process.env.DANG_REQUIRE_POSTGRES === "1";
  const requireRedis = process.env.DANG_REQUIRE_REDIS === "1";
  const dbRoleStrict = isDbRoleStrict();

  const [database, redis] = await Promise.all([
    input.skipLiveDatabasePing
      ? Promise.resolve<"ok" | "skip" | "fail">(
          databaseConfigured ? "ok" : "skip",
        )
      : pingDatabase(env.databaseUrl),
    pingRedis(redisConfigured),
  ]);

  let probe: DbRoleProbeRow | null | undefined = input.dbRoleProbe;
  if (
    probe === undefined &&
    databaseConfigured &&
    !input.skipLiveDbRoleProbe
  ) {
    probe = await probeDbRole(env.databaseUrl);
  }

  const dbRoleCheck = evaluateDbRoleCheck(probe ?? null, {
    configured: databaseConfigured,
    strict: dbRoleStrict,
  });
  logDbRoleCheck(dbRoleCheck);

  const degraded =
    (requirePg && database !== "ok") ||
    (requirePg && input.iamPersistence === "memory") ||
    (requireRedis && redis !== "ok") ||
    (databaseConfigured && database === "fail") ||
    (redisConfigured && redis === "fail") ||
    dbRoleCheck.status === "fail";

  return {
    status: degraded ? "degraded" : "ready",
    checks: {
      iam: input.iamPersistence,
      requirePostgres: requirePg,
      databaseConfigured,
      database,
      redisConfigured,
      redis,
      dbRole: dbRoleCheck.status,
      dbRoleStrict,
    },
  };
}
