// Zod body-validation exempt: GET/body-less read controller. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { withSpan } from "@dang/observability";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { evaluateReadiness } from "./readiness.js";

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
    requirePostgres: boolean;
    databaseConfigured: boolean;
    database: "ok" | "skip" | "fail";
    redisConfigured: boolean;
    redis: "ok" | "skip" | "fail";
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
    return withSpan("health.ready", {}, async () => {
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
    });
  }

  private async buildReadiness(): Promise<ReadinessResponse> {
    const snapshot = await evaluateReadiness({
      iamPersistence: this.iam.persistence,
    });
    return {
      status: snapshot.status,
      service: "dang-api",
      version: "0.1.0",
      checks: snapshot.checks,
    };
  }
}
