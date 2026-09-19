import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  UpsertWorkspacePayoutInstructionsRequest,
  WorkspacePayoutInstructions,
} from "@dang/contracts";
import { upsertWorkspacePayoutInstructionsSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { payoutDestinationEncryptionMode } from "./payout-destination-crypto.js";
import {
  PAYOUT_INSTRUCTIONS_STORE,
  type PayoutInstructionsStore,
} from "./payout-instructions.types.js";

@ApiTags("payout-instructions")
@Controller("workspaces/:workspaceId/payout-instructions")
export class PayoutInstructionsController {
  constructor(
    @Inject(PAYOUT_INSTRUCTIONS_STORE)
    private readonly store: PayoutInstructionsStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Workspace payout destination for statements (null when unset)",
  })
  async get(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspacePayoutInstructions | null> {
    await this.access.requireMember(workspaceId, actor.userId);
    const row = await this.store.get(workspaceId, actor.userId);
    return row ? toPublic(row) : null;
  }

  @Put()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Set workspace payout destination (owner/admin via ABAC)" })
  async put(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(upsertWorkspacePayoutInstructionsSchema))
    body: UpsertWorkspacePayoutInstructionsRequest,
  ): Promise<WorkspacePayoutInstructions> {
    await this.access.requireAccess(workspaceId, actor.userId, "payout.manage");
    const saved = await this.store.upsert(workspaceId, actor.userId, body);
    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "workspace.payout_instructions.upsert",
      targetType: "workspace_payout_profile",
      targetId: workspaceId,
      result: "success",
      metadata: {
        destinationKind: saved.destinationKind,
        holderName: saved.holderName,
        crypto: payoutDestinationEncryptionMode(),
      },
    });
    this.securityEvents.emit("privacy.payout_destination_updated", {
      workspaceId,
      actorUserId: actor.userId,
      targetType: "workspace_payout_profile",
      targetId: workspaceId,
      reason: "upsert",
      attrs: {
        destinationKind: saved.destinationKind,
        crypto: payoutDestinationEncryptionMode(),
      },
    });
    return toPublic(saved);
  }

  @Delete()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Clear workspace payout destination (owner/admin via ABAC)" })
  async clear(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<{ cleared: boolean }> {
    await this.access.requireAccess(workspaceId, actor.userId, "payout.manage");
    const cleared = await this.store.clear(workspaceId, actor.userId);
    if (cleared) {
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.payout_instructions.clear",
        targetType: "workspace_payout_profile",
        targetId: workspaceId,
        result: "success",
        metadata: { crypto: payoutDestinationEncryptionMode() },
      });
      this.securityEvents.emit("privacy.payout_destination_cleared", {
        workspaceId,
        actorUserId: actor.userId,
        targetType: "workspace_payout_profile",
        targetId: workspaceId,
        reason: "clear",
        attrs: { crypto: payoutDestinationEncryptionMode() },
      });
    }
    return { cleared };
  }
}

function toPublic(row: {
  holderName: string;
  destinationKind: "card" | "iban";
  destinationValue: string;
  bankName?: string;
  updatedAt?: string;
  updatedByUserId?: string;
}): WorkspacePayoutInstructions {
  return {
    holderName: row.holderName,
    destinationKind: row.destinationKind,
    destinationValue: row.destinationValue,
    bankName: row.bankName,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}
