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
import { canViewProductMetrics } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AUDIT_STORE, type AuditStore } from "./audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { aggregateWorkspaceProductMetrics } from "./product-metrics.js";

@ApiTags("product-metrics")
@Controller("workspaces/:workspaceId/product-metrics")
export class ProductMetricsController {
  constructor(
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

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
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    const role = members.find((m) => m.userId === actor.userId)?.role;
    if (!canViewProductMetrics(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Product metrics restricted",
        status: 403,
        detail: "Only owner, admin, finance, or auditor may read product metrics.",
      });
    }

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
