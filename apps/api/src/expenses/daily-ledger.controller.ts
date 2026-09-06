import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateDailyLedgerEntryRequest,
  CreateWorkspaceRangeLockRequest,
  DailyLedgerResponse,
  UpdateDailyLedgerEntryRequest,
  UpsertWorkspaceDayRequest,
  UpsertWorkspaceDayResponse,
  WorkspaceRangeLockSummary,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { DailyLedgerService } from "./daily-ledger.service.js";

@ApiTags("daily-ledger")
@Controller("workspaces/:workspaceId/daily-ledger")
export class DailyLedgerController {
  constructor(
    @Inject(DailyLedgerService) private readonly dailyLedger: DailyLedgerService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Day×member consumption ledger for a date range" })
  async getLedger(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("from") fromQ?: string,
    @Query("to") toQ?: string,
    @Query("preset") presetQ?: string,
    @Query("days") daysQ?: string,
  ): Promise<DailyLedgerResponse> {
    return this.dailyLedger.getLedger(actor, workspaceId, fromQ, toQ, presetQ, daysQ);
  }

  @Get("export.csv")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Download daily ledger matrix as CSV" })
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Res() reply: FastifyReply,
    @Query("from") fromQ?: string,
    @Query("to") toQ?: string,
    @Query("preset") presetQ?: string,
    @Query("days") daysQ?: string,
  ): Promise<void> {
    const { body, filename } = await this.dailyLedger.exportCsvPayload(
      actor,
      workspaceId,
      fromQ,
      toQ,
      presetQ,
      daysQ,
    );
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.send(body);
  }

  @Put("days/:date")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Set manual holiday flag and/or day note (restore on unset)" })
  async upsertDay(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("date") date: string,
    @Body() body: UpsertWorkspaceDayRequest,
  ): Promise<UpsertWorkspaceDayResponse> {
    return this.dailyLedger.upsertDay(actor, workspaceId, date, body);
  }

  @Get("range-locks")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List daily-ledger range locks" })
  async listLocks(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("active") activeQ?: string,
  ): Promise<WorkspaceRangeLockSummary[]> {
    return this.dailyLedger.listLocks(actor, workspaceId, activeQ);
  }

  @Post("range-locks")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Lock a date range (owner/admin/finance) — blocks edits" })
  async createLock(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateWorkspaceRangeLockRequest,
  ): Promise<WorkspaceRangeLockSummary> {
    return this.dailyLedger.createLock(actor, workspaceId, body);
  }

  @Post("range-locks/:lockId/unlock")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Unlock a range lock (owner/admin/finance)" })
  async unlockLock(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("lockId") lockId: string,
  ): Promise<WorkspaceRangeLockSummary> {
    return this.dailyLedger.unlockLock(actor, workspaceId, lockId);
  }

  @Post("entries")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Add item name + amount to a member column or shared (هزینه مشترک) column",
  })
  async addEntry(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateDailyLedgerEntryRequest,
  ): Promise<DailyLedgerResponse> {
    return this.dailyLedger.addEntry(actor, workspaceId, body);
  }

  @Post("import")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Import CSV rows: date_iso,column,item_name,amount_toman (column=shared|member name)",
  })
  async importCsv(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { csv: string; idempotencyKey?: string },
  ): Promise<{ imported: number; skipped: number; ledger: DailyLedgerResponse }> {
    return this.dailyLedger.importCsv(actor, workspaceId, body);
  }

  @Patch("entries/:expenseId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Edit item name/amount (reverse old + recreate)" })
  async updateEntry(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Body() body: UpdateDailyLedgerEntryRequest,
  ): Promise<DailyLedgerResponse> {
    return this.dailyLedger.updateEntry(actor, workspaceId, expenseId, body);
  }

  @Delete("entries/:expenseId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Delete (reverse) a daily ledger item" })
  async deleteEntry(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<DailyLedgerResponse> {
    return this.dailyLedger.deleteEntry(actor, workspaceId, expenseId);
  }
}
