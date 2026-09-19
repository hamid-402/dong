import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AddWorkspaceMemberBody,
  ApproveJoinRequestBody,
  AuthActor,
  CreateJoinRequestBody,
  DisableWorkspaceMemberBody,
  JoinRequestSummary,
  MembershipSummary,
  OwnershipTransferSummary,
  ProposeOwnershipTransferBody,
  UpdateWorkspaceMemberBody,
} from "@dang/contracts";
import {
  addWorkspaceMemberRequestSchema,
  approveJoinRequestSchema,
  createJoinRequestSchema,
  disableWorkspaceMemberRequestSchema,
  proposeOwnershipTransferSchema,
  updateWorkspaceMemberRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { MembershipService } from "./membership.service.js";

@ApiTags("membership")
@Controller()
@UseGuards(AuthGuard)
export class MembershipController {
  constructor(
    @Inject(MembershipService) private readonly membership: MembershipService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Post("workspaces/:workspaceId/members")
  @ApiOperation({ summary: "Add an existing user as workspace member" })
  @ApiHeader({ name: "idempotency-key", required: false })
  addMember(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(addWorkspaceMemberRequestSchema))
    body: AddWorkspaceMemberBody,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<MembershipSummary> {
    return this.idempotency.run(
      "membership.add",
      `${actor.userId}:${workspaceId}:${body.userId}`,
      idempotencyKey,
      () => this.membership.addMember(actor, workspaceId, body),
    );
  }

  @Patch("workspaces/:workspaceId/members/:userId")
  @ApiOperation({ summary: "Change member role and/or default shares" })
  updateMember(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(updateWorkspaceMemberRequestSchema))
    body: UpdateWorkspaceMemberBody,
  ): Promise<MembershipSummary> {
    return this.membership.updateMember(actor, workspaceId, userId, body);
  }

  @Post("workspaces/:workspaceId/members/:userId/disable")
  @ApiOperation({ summary: "Soft-disable a workspace member" })
  disableMember(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(disableWorkspaceMemberRequestSchema))
    body: DisableWorkspaceMemberBody,
  ): Promise<MembershipSummary> {
    return this.membership.disableMember(actor, workspaceId, userId, body);
  }

  @Post("workspaces/:workspaceId/members/:userId/enable")
  @ApiOperation({ summary: "Re-enable a disabled workspace member" })
  enableMember(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
  ): Promise<MembershipSummary> {
    return this.membership.enableMember(actor, workspaceId, userId);
  }

  @Get("workspaces/:workspaceId/join-requests")
  @ApiOperation({ summary: "List join requests for managers" })
  listJoinRequests(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<JoinRequestSummary[]> {
    return this.membership.listJoinRequests(actor, workspaceId);
  }

  @Post("workspaces/:slug/join-requests")
  @ApiOperation({ summary: "Request to join a workspace by slug" })
  @ApiHeader({ name: "idempotency-key", required: false })
  createJoinRequest(
    @CurrentActor() actor: AuthActor,
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(createJoinRequestSchema)) body: CreateJoinRequestBody,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<JoinRequestSummary> {
    return this.idempotency.run(
      "membership.join_request",
      `${actor.userId}:${slug}`,
      idempotencyKey,
      () => this.membership.createJoinRequest(actor, slug, body),
    );
  }

  @Post("workspaces/:workspaceId/join-requests/:reqId/approve")
  approveJoinRequest(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("reqId") reqId: string,
    @Body(new ZodValidationPipe(approveJoinRequestSchema)) body: ApproveJoinRequestBody,
  ): Promise<JoinRequestSummary> {
    return this.membership.approveJoinRequest(actor, workspaceId, reqId, body);
  }

  @Post("workspaces/:workspaceId/join-requests/:reqId/reject")
  rejectJoinRequest(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("reqId") reqId: string,
  ): Promise<JoinRequestSummary> {
    return this.membership.rejectJoinRequest(actor, workspaceId, reqId);
  }

  @Delete("join-requests/:reqId")
  withdrawJoinRequest(
    @CurrentActor() actor: AuthActor,
    @Param("reqId") reqId: string,
  ): Promise<JoinRequestSummary> {
    return this.membership.withdrawJoinRequest(actor, reqId);
  }

  @Post("workspaces/:workspaceId/ownership-transfer")
  proposeOwnershipTransfer(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(proposeOwnershipTransferSchema))
    body: ProposeOwnershipTransferBody,
  ): Promise<OwnershipTransferSummary> {
    return this.membership.proposeOwnershipTransfer(actor, workspaceId, body);
  }

  @Get("workspaces/:workspaceId/ownership-transfer")
  @ApiOperation({ summary: "List pending ownership transfers for the workspace" })
  listOwnershipTransfers(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<OwnershipTransferSummary[]> {
    return this.membership.listOwnershipTransfers(actor, workspaceId);
  }

  @Post("workspaces/:workspaceId/ownership-transfer/:tid/accept")
  acceptOwnershipTransfer(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("tid") tid: string,
  ): Promise<OwnershipTransferSummary> {
    return this.membership.acceptOwnershipTransfer(actor, workspaceId, tid);
  }

  @Post("workspaces/:workspaceId/ownership-transfer/:tid/cancel")
  cancelOwnershipTransfer(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("tid") tid: string,
  ): Promise<OwnershipTransferSummary> {
    return this.membership.cancelOwnershipTransfer(actor, workspaceId, tid);
  }
}
