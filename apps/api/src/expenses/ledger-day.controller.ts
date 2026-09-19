import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  DailyLedgerDayTemplateResponse,
  DailyLedgerResponse,
  PostLedgerDayRequest,
} from "@dang/contracts";
import { postLedgerDayRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DailyLedgerService } from "./daily-ledger.service.js";

/**
 * S11-07 batch day consumption + template endpoints.
 * Additive alongside `/daily-ledger/*` free-text paths.
 */
@ApiTags("ledger-day")
@Controller("workspaces/:workspaceId/ledger/day")
export class LedgerDayController {
  constructor(
    @Inject(DailyLedgerService) private readonly dailyLedger: DailyLedgerService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Post shared (equal) + personal day lines in one request (catalog-aware)",
  })
  async postDay(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(postLedgerDayRequestSchema))
    body: PostLedgerDayRequest,
  ): Promise<DailyLedgerResponse> {
    return this.dailyLedger.postDay(actor, workspaceId, body);
  }

  @Get(":date/template")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Day template from real frequent usage + yesterday selections (empty if none)",
  })
  async getTemplate(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("date") date: string,
  ): Promise<DailyLedgerDayTemplateResponse> {
    return this.dailyLedger.getDayTemplate(actor, workspaceId, date);
  }
}
