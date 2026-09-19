import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  ClaimGuestPlaceholderRequest,
  ClaimGuestPlaceholderResponse,
  CreateGuestPlaceholderRequest,
  GuestPlaceholderSummary,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { GuestsService } from "./guests.service.js";

@ApiTags("guests")
@Controller()
export class GuestsController {
  constructor(@Inject(GuestsService) private readonly guests: GuestsService) {}

  @Get("workspaces/:workspaceId/guest-placeholders")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List guest placeholders in a workspace" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<GuestPlaceholderSummary[]> {
    return this.guests.list(actor, workspaceId);
  }

  @Post("workspaces/:workspaceId/guest-placeholders")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a claimable guest placeholder" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateGuestPlaceholderRequest,
  ): Promise<GuestPlaceholderSummary> {
    return this.guests.create(actor, workspaceId, body);
  }

  @Post("guest-placeholders/claim")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Claim a guest placeholder and remap ledger debts" })
  claim(
    @CurrentActor() actor: AuthActor,
    @Body() body: ClaimGuestPlaceholderRequest,
  ): Promise<ClaimGuestPlaceholderResponse> {
    return this.guests.claim(actor, body);
  }
}
