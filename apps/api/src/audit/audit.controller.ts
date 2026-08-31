import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AUDIT_STORE, type AuditRecord, type AuditStore } from "./audit.types.js";

@ApiTags("audit")
@Controller("workspaces/:workspaceId/audit-events")
export class AuditController {
  constructor(@Inject(AUDIT_STORE) private readonly audit: AuditStore) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List audit events for a workspace (member only)" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  async list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<AuditRecord[]> {
    const events = await this.audit.listForWorkspace(workspaceId, actor.userId);
    if (!events) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return events;
  }
}
