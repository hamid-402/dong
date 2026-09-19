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
  ConfirmSettlementRequest,
  ConfirmSimplifySettlementClaimsRequest,
  ConfirmSimplifySettlementClaimsResponse,
  CreateSettlementClaimRequest,
  CreateSimplifySettlementClaimsRequest,
  CreateSimplifySettlementClaimsResponse,
  PreviewSettlementEffectRequest,
  PreviewSettlementEffectResponse,
  SettlementSummary,
} from "@dang/contracts";
import {
  confirmSettlementRequestSchema,
  confirmSimplifySettlementClaimsRequestSchema,
  createSettlementClaimRequestSchema,
  createSimplifySettlementClaimsRequestSchema,
  previewSettlementEffectRequestSchema,
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
    summary:
      "Claim a settlement (status claimed only — no journal until confirm)",
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

  @Post("confirm-simplify-claims")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Confirm open debt-simplify claims the actor may confirm (ENABLE_DEBT_SIMPLIFY_API)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  confirmSimplifyClaims(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(confirmSimplifySettlementClaimsRequestSchema))
    body: ConfirmSimplifySettlementClaimsRequest,
  ): Promise<ConfirmSimplifySettlementClaimsResponse> {
    return this.settlements.confirmSimplifyClaims(actor, workspaceId, body);
  }

  @Post("preview-effect")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Preview balance nets before/after hypothetical settlement transfers from live ledger",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  previewEffect(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(previewSettlementEffectRequestSchema))
    body: PreviewSettlementEffectRequest,
  ): Promise<PreviewSettlementEffectResponse> {
    return this.settlements.previewSettlementEffect(actor, workspaceId, body);
  }

  @Post(":settlementId/confirm")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Confirm a claimed settlement and post balanced journal lines",
  })
  confirm(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("settlementId") settlementId: string,
    @Body(new ZodValidationPipe(confirmSettlementRequestSchema))
    body: ConfirmSettlementRequest,
  ): Promise<SettlementSummary> {
    return this.settlements.confirm(actor, workspaceId, settlementId, body);
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
