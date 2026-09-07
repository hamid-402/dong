// Zod body-validation exempt: GET/body-less read controller. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import { createDatabase, sql } from "@dang/db";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { getRedisClient } from "../jobs/redis-queue.js";

type LivenessResponse = {
  status: "ok";
  service: "dang-api";
};

type ReadinessResponse = {
  status: "ready" | "degraded";
  service: "dang-api";
  version: string;
  checks: {
    iam: "memory" | "postgres";
    /** When DANG_REQUIRE_POSTGRES=1, ready fails if iam is memory or DB ping fails. */
    requirePostgres: boolean;
    databaseConfigured: boolean;
    database: "ok" | "skip" | "fail";
    redisConfigured: boolean;
    redis: "ok" | "skip" | "fail";
    oidcConfigured: boolean;
    allowDevAuth: boolean;
  };
};

type HealthResponse = {
  status: "ok" | "degraded";
  service: "dang-api";
  version: string;
  iamPersistence: "memory" | "postgres";
  readiness: "ready" | "degraded";
};

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

  @Get()
  @ApiOperation({ summary: "Legacy combined health" })
  @ApiOkResponse({
    schema: {
      example: {
        status: "ok",
        service: "dang-api",
        version: "0.1.0",
        iamPersistence: "memory",
      },
    },
  })
  async getHealth(): Promise<HealthResponse> {
    const ready = await this.buildReadiness();
    return {
      status: ready.status === "ready" ? "ok" : "degraded",
      service: "dang-api",
      version: "0.1.0",
      iamPersistence: this.iam.persistence,
      readiness: ready.status,
    };
  }

  @Get("live")
  @ApiOperation({ summary: "Liveness probe — process is up" })
  getLive(): LivenessResponse {
    return { status: "ok", service: "dang-api" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe — safe to receive traffic" })
  async getReady(): Promise<ReadinessResponse> {
    const ready = await this.buildReadiness();
    const requirePg = process.env.DANG_REQUIRE_POSTGRES === "1";
    const requireRedis = process.env.DANG_REQUIRE_REDIS === "1";
    const hardFail =
      (requirePg && ready.checks.database !== "ok") ||
      (requirePg && ready.checks.iam === "memory") ||
      (requireRedis && ready.checks.redis !== "ok");
    if (hardFail || (ready.status === "degraded" && requirePg)) {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/not-ready",
        title: "API not ready",
        status: 503,
        detail: "Required dependency check failed",
        checks: ready.checks,
      });
    }
    return ready;
  }

  private async buildReadiness(): Promise<ReadinessResponse> {
    const env = loadAppEnv();
    const databaseConfigured = Boolean(env.databaseUrl);
    const redisConfigured = isRedisConfigured(env);
    const oidcConfigured = Boolean(env.oidcIssuerUrl && env.oidcClientId);
    const requirePg = process.env.DANG_REQUIRE_POSTGRES === "1";
    const requireRedis = process.env.DANG_REQUIRE_REDIS === "1";
    const iamPersistence = this.iam.persistence;

    const [database, redis] = await Promise.all([
      this.pingDatabase(env.databaseUrl),
      this.pingRedis(redisConfigured),
    ]);

    const degraded =
      (requirePg && database !== "ok") ||
      (requirePg && iamPersistence === "memory") ||
      (requireRedis && redis !== "ok") ||
      (databaseConfigured && database === "fail") ||
      (redisConfigured && redis === "fail");

    return {
      status: degraded ? "degraded" : "ready",
      service: "dang-api",
      version: "0.1.0",
      checks: {
        iam: iamPersistence,
        requirePostgres: requirePg,
        databaseConfigured,
        database,
        redisConfigured,
        redis,
        oidcConfigured,
        allowDevAuth: env.allowDevAuth,
      },
    };
  }

  private dbPingCache: { at: number; result: "ok" | "fail" } | null = null;

  private async pingDatabase(
    databaseUrl: string | undefined,
  ): Promise<"ok" | "skip" | "fail"> {
    if (!databaseUrl) return "skip";
    const now = Date.now();
    if (this.dbPingCache && now - this.dbPingCache.at < 2000) {
      return this.dbPingCache.result;
    }
    try {
      const database = createDatabase(databaseUrl);
      await database.db.execute(sql`select 1`);
      // Never close the shared app pool here — ping only.
      this.dbPingCache = { at: now, result: "ok" };
      return "ok";
    } catch {
      this.dbPingCache = { at: now, result: "fail" };
      return "fail";
    }
  }

  private async pingRedis(configured: boolean): Promise<"ok" | "skip" | "fail"> {
    if (!configured) return "skip";
    try {
      const client = await getRedisClient();
      if (!client) return "fail";
      const pong = await client.ping();
      return pong === "PONG" ? "ok" : "fail";
    } catch {
      return "fail";
    }
  }
}
