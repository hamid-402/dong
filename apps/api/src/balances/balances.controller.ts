// Zod body-validation: GET + remind-debt POST. See docs/adr/ADR-zod-get-exemptions.md
import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  DebtSimplifySuggestionsResponse,
  RemindDebtRequest,
  RemindDebtResponse,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { remindDebtRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BalancesService } from "./balances.service.js";

@ApiTags("balances")
@Controller("workspaces/:workspaceId/balances")
export class BalancesController {
  constructor(@Inject(BalancesService) private readonly balances: BalancesService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Balances projected from in-memory double-entry journal",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  get(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceBalancesResponse> {
    return this.balances.getProvisional(actor, workspaceId);
  }

  @Post("remind-debt")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Send an in-app debt reminder to a member with negative net balance",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  remindDebt(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(remindDebtRequestSchema)) body: RemindDebtRequest,
  ): Promise<RemindDebtResponse> {
    return this.balances.remindDebt(actor, workspaceId, body.targetUserId);
  }

  @Get("simplify-suggestions")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "First-class debt simplification suggestions (ENABLE_DEBT_SIMPLIFY_API)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  simplifySuggestions(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<DebtSimplifySuggestionsResponse> {
    return this.balances.getSimplifySuggestions(actor, workspaceId);
  }
}
