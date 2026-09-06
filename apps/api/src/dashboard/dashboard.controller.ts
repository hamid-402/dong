import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  PersonalDashboardResponse,
  WorkspaceDashboardResponse,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { DashboardService } from "./dashboard.service.js";

@ApiTags("dashboard")
@Controller()
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get("workspaces/:workspaceId/dashboard")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Workspace dashboard: spend, settlements, activity, balances — store aggregates only",
  })
  workspaceDashboard(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<WorkspaceDashboardResponse> {
    return this.dashboard.workspaceDashboard(actor, workspaceId, from, to);
  }

  @Get("me/dashboard")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Personal dashboard: finance overview + workspace count",
  })
  personalDashboard(
    @CurrentActor() actor: AuthActor,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<PersonalDashboardResponse> {
    return this.dashboard.personalDashboard(actor, from, to);
  }
}
