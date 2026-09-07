import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import type { ApprovalQueueItem, AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ApprovalQueueService } from "./approval-queue.service.js";

@Controller("workspaces/:workspaceId/approval-queue")
@UseGuards(AuthGuard)
export class ApprovalQueueController {
  constructor(
    @Inject(ApprovalQueueService) private readonly queue: ApprovalQueueService,
  ) {}

  @Get()
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ApprovalQueueItem[]> {
    return this.queue.list(actor, workspaceId);
  }
}
