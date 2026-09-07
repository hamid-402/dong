import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateSettlementClaimRequest,
  CreateSimplifySettlementClaimsRequest,
  CreateSimplifySettlementClaimsResponse,
  SettlementSummary,
} from "@dang/contracts";
import {
  createSettlementClaimRequestSchema,
  createSimplifySettlementClaimsRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SettlementsService } from "./settlements.service.js";

@ApiTags("settlements")
@Controller("workspaces/:workspaceId/settlements")
export class SettlementsController {
  constructor(
    @Inject(SettlementsService) private readonly settlements: SettlementsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Claim a settlement (no ledger / no custody — Phase 2 stub)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createSettlementClaimRequestSchema))
    body: CreateSettlementClaimRequest,
  ): Promise<SettlementSummary> {
    return this.settlements.createClaim(actor, workspaceId, body);
  }

  @Post("simplify-claims")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Create settlement claims from greedy debt-simplify suggestions (ENABLE_DEBT_SIMPLIFY_API)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  createSimplifyClaims(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createSimplifySettlementClaimsRequestSchema))
    body: CreateSimplifySettlementClaimsRequest,
  ): Promise<CreateSimplifySettlementClaimsResponse> {
    return this.settlements.createSimplifyClaims(actor, workspaceId, body);
  }

  @Post(":settlementId/confirm")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Confirm a claimed settlement (status only — no ledger yet)",
  })
  confirm(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("settlementId") settlementId: string,
  ): Promise<SettlementSummary> {
    return this.settlements.confirm(actor, workspaceId, settlementId);
  }

  @Post(":settlementId/dispute")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Dispute a claimed settlement" })
  dispute(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("settlementId") settlementId: string,
  ): Promise<SettlementSummary> {
    return this.settlements.dispute(actor, workspaceId, settlementId);
  }

  @Post(":settlementId/cancel")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Cancel a claimed or disputed settlement" })
  cancel(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("settlementId") settlementId: string,
  ): Promise<SettlementSummary> {
    return this.settlements.cancel(actor, workspaceId, settlementId);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List settlement claims in a workspace" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<SettlementSummary[]> {
    return this.settlements.list(actor, workspaceId);
  }
}
