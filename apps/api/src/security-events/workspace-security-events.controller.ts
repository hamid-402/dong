import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, SecurityEventListPage } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { SecurityEventsService } from "./security-events.service.js";

@ApiTags("security-events")
@Controller("workspaces/:workspaceId")
@UseGuards(AuthGuard)
export class WorkspaceSecurityEventsController {
  constructor(
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
  ) {}

  @Get("security-events")
  @ApiOperation({
    summary: "List security events for this workspace (owner/admin/finance)",
  })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor?: string,
    @Query("category") category?: string,
    @Query("severity") severity?: string,
    @Query("limit") limitRaw?: string,
  ): Promise<SecurityEventListPage> {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.securityEvents.listForWorkspace(actor, workspaceId, {
      cursor,
      category,
      severity,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
