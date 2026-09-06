import {
  Body,
  Controller,
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
  AuthActor,
  CastProposalVoteRequest,
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { ProposalsService } from "./proposals.service.js";

@ApiTags("proposals")
@Controller("workspaces/:workspaceId")
export class ProposalsController {
  constructor(
    @Inject(ProposalsService) private readonly proposals: ProposalsService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Get("proposal-settings")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Get proposal quorum settings" })
  getSettings(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ProposalSettingsSummary> {
    return this.proposals.getSettings(actor, workspaceId);
  }

  @Patch("proposal-settings")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Update proposal quorum percent (owner/admin)" })
  updateSettings(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: UpdateProposalSettingsRequest,
  ): Promise<ProposalSettingsSummary> {
    return this.proposals.updateSettings(actor, workspaceId, body);
  }

  @Get("proposals")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List proposals with live vote tallies" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ProposalSummary[]> {
    return this.proposals.list(actor, workspaceId);
  }

  @Post("proposals")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a goods/service proposal" })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateProposalRequest,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<ProposalSummary> {
    const key = idempotencyKey ?? body.idempotencyKey;
    return this.idempotency.run(`proposal.create:${workspaceId}`, actor.userId, key, () =>
      this.proposals.create(actor, workspaceId, {
        ...body,
        idempotencyKey: key,
      }),
    );
  }

  @Post("proposals/:proposalId/votes")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Cast or change a yes/no vote" })
  vote(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Body() body: CastProposalVoteRequest,
  ): Promise<ProposalSummary> {
    return this.proposals.vote(actor, workspaceId, proposalId, body);
  }

  @Post("proposals/:proposalId/withdraw")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Withdraw an open proposal" })
  withdraw(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
  ): Promise<ProposalSummary> {
    return this.proposals.withdraw(actor, workspaceId, proposalId);
  }
}
