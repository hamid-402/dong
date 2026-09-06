import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateInviteRequest,
  CreateInviteResponse,
  InviteSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { InvitesService } from "./invites.service.js";

@ApiTags("invites")
@Controller()
export class InvitesController {
  constructor(
    @Inject(InvitesService) private readonly invites: InvitesService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Post("workspaces/:workspaceId/invites")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a workspace invite (owner/admin)" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateInviteRequest,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<CreateInviteResponse> {
    return this.idempotency.run(
      `invite.create:${workspaceId}`,
      actor.userId,
      idempotencyKey,
      () => this.invites.create(actor, workspaceId, body),
    );
  }

  @Get("workspaces/:workspaceId/invites")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List invites for a workspace" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<InviteSummary[]> {
    return this.invites.list(actor, workspaceId);
  }

  @Post("invites/accept")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Accept an invite token and join the workspace" })
  accept(
    @CurrentActor() actor: AuthActor,
    @Body() body: { token?: string },
  ): Promise<WorkspaceSummary> {
    return this.invites.accept(actor, body.token ?? "");
  }
}
