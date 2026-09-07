// Zod body-validation exempt: GET/body-less read controller. See docs/adr/ADR-zod-get-exemptions.md
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, WorkspaceProductMetricsResponse } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AUDIT_STORE, type AuditStore } from "./audit.types.js";
import { aggregateWorkspaceProductMetrics } from "./product-metrics.js";

@ApiTags("product-metrics")
@Controller("workspaces/:workspaceId/product-metrics")
export class ProductMetricsController {
  constructor(@Inject(AUDIT_STORE) private readonly audit: AuditStore) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Workspace product funnel counts from real audit events (no invented rates)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  async get(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceProductMetricsResponse> {
    const events = await this.audit.listForWorkspace(workspaceId, actor.userId);
    if (!events) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return aggregateWorkspaceProductMetrics(
      workspaceId,
      events,
      this.audit.persistence,
    );
  }
}
