import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateExpenseCategoryRequest,
  CreateRecurringRuleRequest,
  CreateReportExportRequest,
  ExpenseCategorySummary,
  RecurringRuleSummary,
  ReportExportSummary,
  ReportGroupBy,
  WorkspaceReportResponse,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { REPORTS_STORE, type ReportsStore } from "./reports.store.js";

@ApiTags("reports")
@Controller("workspaces/:workspaceId")
export class ReportsController {
  constructor(
    @Inject(REPORTS_STORE) private readonly reports: ReportsStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
  ) {}

  @Get("reports")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Workspace expense report for a date range" })
  async report(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("groupBy") groupBy?: ReportGroupBy,
  ): Promise<WorkspaceReportResponse> {
    await this.requireMember(workspaceId, actor.userId);
    this.assertRange(from, to);
    return this.reports.buildReport(
      workspaceId,
      actor.userId,
      from,
      to,
      groupBy ?? "day",
    );
  }

  @Post("reports/exports")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a real CSV export from ledger expenses in range" })
  async createExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateReportExportRequest,
  ): Promise<ReportExportSummary> {
    await this.requireMember(workspaceId, actor.userId);
    this.assertRange(body.from, body.to);
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({ detail: "idempotencyKey لازم است" });
    }
    const created = await this.reports.createExport(workspaceId, actor.userId, body);
    const { csvBody: _, ...summary } = created;
    return summary;
  }

  @Get("reports/exports/:exportId")
  @UseGuards(AuthGuard)
  async getExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("exportId") exportId: string,
  ): Promise<ReportExportSummary> {
    await this.requireMember(workspaceId, actor.userId);
    const row = await this.reports.getExport(workspaceId, exportId, actor.userId);
    if (!row) throw new NotFoundException({ detail: "خروجی پیدا نشد" });
    const { csvBody: _, ...summary } = row;
    return summary;
  }

  @Get("reports/exports/:exportId/file")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Download completed CSV export bytes" })
  @Header("Content-Type", "text/csv; charset=utf-8")
  async downloadExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("exportId") exportId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.requireMember(workspaceId, actor.userId);
    const row = await this.reports.getExport(workspaceId, exportId, actor.userId);
    if (!row?.csvBody || row.status !== "completed") {
      throw new NotFoundException({ detail: "فایل آماده نیست" });
    }
    reply.header(
      "Content-Disposition",
      `attachment; filename="dang-report-${exportId.slice(0, 8)}.csv"`,
    );
    reply.send(row.csvBody);
  }

  @Get("categories")
  @UseGuards(AuthGuard)
  async listCategories(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ExpenseCategorySummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.reports.listCategories(workspaceId, actor.userId);
  }

  @Post("categories")
  @UseGuards(AuthGuard)
  async createCategory(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategorySummary> {
    await this.requireMember(workspaceId, actor.userId);
    if (!body.name?.trim()) throw new BadRequestException({ detail: "نام دسته لازم است" });
    return this.reports.createCategory(workspaceId, actor.userId, body);
  }

  @Get("recurring-rules")
  @UseGuards(AuthGuard)
  async listRecurring(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<RecurringRuleSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.reports.listRecurring(workspaceId, actor.userId);
  }

  @Post("recurring-rules")
  @UseGuards(AuthGuard)
  async createRecurring(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateRecurringRuleRequest,
  ): Promise<RecurringRuleSummary> {
    await this.requireMember(workspaceId, actor.userId);
    if (!body.title?.trim()) throw new BadRequestException({ detail: "عنوان لازم است" });
    return this.reports.createRecurring(workspaceId, actor.userId, body);
  }

  @Post("recurring-rules/run-due")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Run due recurring rules: create equal private/shared drafts and advance next_run_on",
  })
  async runDue(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<{ createdExpenseIds: string[]; titles: string[] }> {
    await this.requireMember(workspaceId, actor.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { due } = await this.reports.runRecurringDue(workspaceId, actor.userId, today);
    const createdExpenseIds: string[] = [];
    const titles: string[] = [];
    for (const rule of due) {
      const draft = await this.expenses.createDraft(actor.userId, {
        workspaceId,
        title: rule.title,
        total: rule.amount,
        paidByUserId: actor.userId,
        splitMethod: "equal",
        participantUserIds: [actor.userId],
        occurredOn: today,
        visibility: rule.visibility,
        categoryId: rule.categoryId,
        idempotencyKey: `recurring:${rule.id}:${today}`,
      });
      createdExpenseIds.push(draft.id);
      titles.push(rule.title);
    }
    return { createdExpenseIds, titles };
  }

  private assertRange(from: string, to: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException({ detail: "بازه تاریخ نامعتبر است" });
    }
    if (from > to) throw new BadRequestException({ detail: "from باید قبل از to باشد" });
  }

  private async requireMember(workspaceId: string, userId: string) {
    const members = await this.iam.listMembers(workspaceId, userId);
    if (!members) throw new NotFoundException({ detail: "عضویت یافت نشد" });
  }
}
