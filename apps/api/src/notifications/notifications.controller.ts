import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, NotificationSummary } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("notifications")
@Controller("workspaces/:workspaceId/notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "In-app notifications for current user" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<NotificationSummary[]> {
    return this.notifications.list(actor, workspaceId);
  }

  @Post(":notificationId/read")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Mark notification as read" })
  markRead(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
  ): Promise<NotificationSummary> {
    return this.notifications.markRead(actor, workspaceId, notificationId);
  }
}
