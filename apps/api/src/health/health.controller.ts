import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { loadAppEnv } from "@dang/config";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";

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
    databaseConfigured: boolean;
    oidcConfigured: boolean;
    allowDevAuth: boolean;
  };
};

type HealthResponse = {
  status: "ok";
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
  getHealth(): HealthResponse {
    const ready = this.buildReadiness();
    return {
      status: "ok",
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
  getReady(): ReadinessResponse {
    const ready = this.buildReadiness();
    if (ready.status === "degraded" && process.env.DANG_REQUIRE_POSTGRES === "1") {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/not-ready",
        title: "API not ready",
        status: 503,
        detail: "Postgres required but DATABASE_URL unset",
      });
    }
    return ready;
  }

  private buildReadiness(): ReadinessResponse {
    const env = loadAppEnv();
    const databaseConfigured = Boolean(env.databaseUrl);
    const oidcConfigured = Boolean(env.oidcIssuerUrl && env.oidcClientId);
    const degraded = Boolean(process.env.DANG_REQUIRE_POSTGRES === "1" && !databaseConfigured);
    return {
      status: degraded ? "degraded" : "ready",
      service: "dang-api",
      version: "0.1.0",
      checks: {
        iam: this.iam.persistence,
        databaseConfigured,
        oidcConfigured,
        allowDevAuth: env.allowDevAuth,
      },
    };
  }
}
