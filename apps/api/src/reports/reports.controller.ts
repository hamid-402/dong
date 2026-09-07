import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateExpenseCategoryRequest,
  CreateRecurringRuleRequest,
  CreateReportExportRequest,
  ExpenseCategorySummary,
  RecurringRuleSummary,
  ReportExportSummary,
  ReportGroupBy,
  WorkspaceReportCompareQuery,
  WorkspaceReportResponse,
  WorkspaceReportCompareResponse,
  ReviseRecurringRuleRequest,
} from "@dang/contracts";
import {
  compareReportTotals,
  createExpenseCategoryRequestSchema,
  createRecurringRuleRequestSchema,
  createReportExportRequestSchema,
  readProductFeatureFlags,
  workspaceReportCompareQuerySchema,
  reviseRecurringRuleSchema,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { RecurrenceRunGuard } from "./recurrence-run.guard.js";
import { REPORTS_STORE, type ReportsStore } from "./reports.store.js";

@ApiTags("reports")
@Controller("workspaces/:workspaceId")
export class ReportsController {
  constructor(
    @Inject(REPORTS_STORE) private readonly reports: ReportsStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    private readonly expenses: ExpensesService,
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

  @Get("reports/compare")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Compare two workspace expense report periods" })
  async compare(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(workspaceReportCompareQuerySchema))
    query: WorkspaceReportCompareQuery,
  ): Promise<WorkspaceReportCompareResponse> {
    if (!readProductFeatureFlags(process.env).biCompare) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "BI period comparison is disabled",
        status: 403,
        detail: "Set ENABLE_BI_COMPARE=1 to enable this feature.",
      });
    }
    await this.requireMember(workspaceId, actor.userId);
    this.assertRange(query.from, query.to);
    this.assertRange(query.priorFrom, query.priorTo);
    const resolvedGroupBy = query.groupBy ?? "day";
    const [current, prior] = await Promise.all([
      this.reports.buildReport(
        workspaceId,
        actor.userId,
        query.from,
        query.to,
        resolvedGroupBy,
      ),
      this.reports.buildReport(
        workspaceId,
        actor.userId,
        query.priorFrom,
        query.priorTo,
        resolvedGroupBy,
      ),
    ]);
    return { current, prior, ...compareReportTotals(current, prior) };
  }

  @Post("reports/exports")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a real CSV export from ledger expenses in range" })
  async createExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createReportExportRequestSchema))
    body: CreateReportExportRequest,
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
    @Body(new ZodValidationPipe(createExpenseCategoryRequestSchema))
    body: CreateExpenseCategoryRequest,
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
    @Body(new ZodValidationPipe(createRecurringRuleRequestSchema))
    body: CreateRecurringRuleRequest,
  ): Promise<RecurringRuleSummary> {
    await this.requireMember(workspaceId, actor.userId);
    if (!body.title?.trim()) throw new BadRequestException({ detail: "عنوان لازم است" });
    return this.reports.createRecurring(workspaceId, actor.userId, body);
  }

  @Post("recurring-rules/:ruleId/revise")
  @UseGuards(AuthGuard)
  async reviseRecurring(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(reviseRecurringRuleSchema)) body: ReviseRecurringRuleRequest,
  ): Promise<RecurringRuleSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      return await this.reports.reviseRecurring(workspaceId, actor.userId, ruleId, body);
    } catch (error) {
      if (error instanceof Error && error.message === "RECURRING_RULE_NOT_FOUND") {
        throw new NotFoundException({ detail: "Recurring rule not found" });
      }
      throw error;
    }
  }

  @Post("recurring-rules/run-due")
  @UseGuards(RecurrenceRunGuard)
  @ApiHeader({ name: "x-dang-internal-job", required: false })
  @ApiHeader({ name: "x-dang-internal-actor-user-id", required: false })
  @ApiOperation({
    summary:
      "Run due recurring rules: create drafts, optionally submit/post, and advance next_run_on",
  })
  async runDue(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("asOf") requestedAsOf?: string,
  ): Promise<{ createdExpenseIds: string[]; titles: string[] }> {
    await this.requireMember(workspaceId, actor.userId);
    const asOf = requestedAsOf ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new BadRequestException({ detail: "asOf باید تاریخ YYYY-MM-DD باشد" });
    }
    const { due } = await this.reports.runRecurringDue(workspaceId, actor.userId, asOf);
    const createdExpenseIds: string[] = [];
    const titles: string[] = [];
    for (const rule of due) {
      const ruleActor: AuthActor = {
        userId: rule.createdByUserId,
        externalSubject: `recurring-rule:${rule.id}`,
        displayName: "Recurring rule owner",
        authMode: actor.authMode,
      };
      let expense = await this.expenses.createDraft(ruleActor, workspaceId, {
        workspaceId,
        title: rule.title,
        total: rule.amount,
        paidByUserId: rule.createdByUserId,
        splitMethod: "equal",
        participantUserIds: [rule.createdByUserId],
        occurredOn: asOf,
        visibility: rule.visibility,
        categoryId: rule.categoryId,
        idempotencyKey: `recurring:${rule.id}:${asOf}`,
      });
      if (rule.autoConfirm && expense.status === "draft") {
        expense = await this.expenses.submit(ruleActor, workspaceId, expense.id);
      }
      if (rule.autoConfirm && expense.status === "submitted") {
        expense = await this.expenses.post(ruleActor, workspaceId, expense.id);
      }
      createdExpenseIds.push(expense.id);
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
