import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, JournalEntrySummary } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { LedgerService } from "./ledger.service.js";

@ApiTags("ledger")
@Controller("workspaces/:workspaceId/ledger/entries")
export class LedgerController {
  constructor(@Inject(LedgerService) private readonly ledger: LedgerService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List in-memory journal entries (Phase 2 stub)" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<JournalEntrySummary[]> {
    return this.ledger.list(actor, workspaceId);
  }
}
