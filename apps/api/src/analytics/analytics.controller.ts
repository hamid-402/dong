// Zod body-validation exempt: GET + body-less POST ETL. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AnalyticsEtlRunSummary,
  AnalyticsWarehouseSnapshot,
  AuthActor,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AnalyticsService } from "./analytics.service.js";

@ApiTags("analytics")
@Controller("workspaces/:workspaceId/analytics")
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  @Get("warehouse")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Read-only analytics warehouse snapshot (R10-20)",
  })
  snapshot(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<AnalyticsWarehouseSnapshot> {
    return this.analytics.snapshot(actor, workspaceId);
  }

  @Post("etl/run")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Run OLTP→analytics ETL for workspace daily spend facts",
  })
  runEtl(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<AnalyticsEtlRunSummary> {
    return this.analytics.runEtl(actor, workspaceId);
  }
}
