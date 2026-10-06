import { Inject, Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { ActivityPage, AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ActivityService } from "./activity.service.js";

@ApiTags("activity")
@Controller("workspaces/:workspaceId/activity")
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Workspace activity feed (audit + notifications)" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string,
  ): Promise<ActivityPage> {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.activity.list(actor, workspaceId, {
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
