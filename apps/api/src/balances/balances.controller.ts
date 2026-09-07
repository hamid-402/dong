// Zod body-validation exempt: GET/body-less read controller. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  DebtSimplifySuggestionsResponse,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
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
