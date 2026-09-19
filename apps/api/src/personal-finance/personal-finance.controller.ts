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
import {
  createIncomeSourceRequestSchema,
  createPersonalCategoryRequestSchema,
  createPersonalFinanceExportRequestSchema,
  createPersonalMoneyAccountRequestSchema,
  createPersonalMoneyTxnRequestSchema,
  createPersonalTransferRequestSchema,
  createSavingsGoalContributionRequestSchema,
  createSavingsGoalRequestSchema,
  putSpendingAlertsRequestSchema,
  recomputeMonthlyCloseRequestSchema,
  updateIncomeSourceRequestSchema,
  updatePersonalCategoryRequestSchema,
  updatePersonalMoneyAccountRequestSchema,
  updateSavingsGoalRequestSchema,
  upsertPersonalBudgetRequestSchema,
  type AuthActor,
  type CreateIncomeSourceRequest,
  type CreatePersonalCategoryRequest,
  type CreatePersonalFinanceExportRequest,
  type CreatePersonalMoneyAccountRequest,
  type CreatePersonalMoneyTxnRequest,
  type CreatePersonalTransferRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type IncomeSourceSummary,
  type MonthlyCloseSummary,
  type PersonalBudgetSummary,
  type PersonalCategorySummary,
  type PersonalFinanceExportSummary,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceTrendsResponse,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalSummary,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
  type UpdateSavingsGoalRequest,
  type UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PersonalFinanceService } from "./personal-finance.service.js";

@ApiTags("personal-finance")
@Controller("me/finance")
export class PersonalFinanceController {
  constructor(
    @Inject(PersonalFinanceService) private readonly finance: PersonalFinanceService,
  ) {}

  @Get("overview")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Cross-workspace personal finance: paid/share in range + current net per workspace",
  })
  overview(
    @CurrentActor() actor: AuthActor,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("scope") scope?: string,
  ): Promise<PersonalFinanceOverviewResponse> {
    return this.finance.overview(actor, from, to, scope);
  }

  @Get("trends")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Time-series personal finance: group paid/share + personal expenses",
  })
  trends(
    @CurrentActor() actor: AuthActor,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("groupBy") groupByRaw?: string,
  ): Promise<PersonalFinanceTrendsResponse> {
    return this.finance.trends(actor, from, to, groupByRaw);
  }

  @Get("resources")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Personal accounts total + current month budget" })
  resourcesSummary(
    @CurrentActor() actor: AuthActor,
    @Query("yearMonth") yearMonth?: string,
  ): Promise<PersonalResourcesSummary> {
    return this.finance.resourcesSummary(actor, yearMonth);
  }

  @Get("accounts")
  @UseGuards(AuthGuard)
  listAccounts(
    @CurrentActor() actor: AuthActor,
    @Query("includeArchived") includeArchived?: string,
  ): Promise<PersonalMoneyAccountSummary[]> {
    return this.finance.listAccounts(actor, includeArchived);
  }

  @Post("accounts")
  @UseGuards(AuthGuard)
  createAccount(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createPersonalMoneyAccountRequestSchema))
    body: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.finance.createAccount(actor, body);
  }

  @Patch("accounts/:accountId")
  @UseGuards(AuthGuard)
  updateAccount(
    @CurrentActor() actor: AuthActor,
    @Param("accountId") accountId: string,
    @Body(new ZodValidationPipe(updatePersonalMoneyAccountRequestSchema))
    body: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.finance.updateAccount(actor, accountId, body);
  }

  @Get("transactions")
  @UseGuards(AuthGuard)
  listTxns(
    @CurrentActor() actor: AuthActor,
    @Query("accountId") accountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ): Promise<PersonalMoneyTxnSummary[]> {
    return this.finance.listTxns(actor, { accountId, from, to, limit });
  }

  @Post("transactions")
  @UseGuards(AuthGuard)
  createTxn(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createPersonalMoneyTxnRequestSchema))
    body: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary> {
    return this.finance.createTxn(actor, body);
  }

  @Post("transfers")
  @UseGuards(AuthGuard)
  createTransfer(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createPersonalTransferRequestSchema))
    body: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }> {
    return this.finance.createTransfer(actor, body);
  }

  @Get("budgets")
  @UseGuards(AuthGuard)
  listBudgets(@CurrentActor() actor: AuthActor): Promise<PersonalBudgetSummary[]> {
    return this.finance.listBudgets(actor);
  }

  @Post("budgets")
  @UseGuards(AuthGuard)
  upsertBudget(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(upsertPersonalBudgetRequestSchema))
    body: UpsertPersonalBudgetRequest,
  ): Promise<PersonalBudgetSummary> {
    return this.finance.upsertBudget(actor, body);
  }

  @Get("categories")
  @UseGuards(AuthGuard)
  listCategories(@CurrentActor() actor: AuthActor): Promise<PersonalCategorySummary[]> {
    return this.finance.listCategories(actor);
  }

  @Post("categories")
  @UseGuards(AuthGuard)
  createCategory(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createPersonalCategoryRequestSchema))
    body: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.finance.createCategory(actor, body);
  }

  @Patch("categories/:categoryId")
  @UseGuards(AuthGuard)
  updateCategory(
    @CurrentActor() actor: AuthActor,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(updatePersonalCategoryRequestSchema))
    body: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.finance.updateCategory(actor, categoryId, body);
  }

  @Delete("categories/:categoryId")
  @UseGuards(AuthGuard)
  deleteCategory(
    @CurrentActor() actor: AuthActor,
    @Param("categoryId") categoryId: string,
  ): Promise<{ ok: true }> {
    return this.finance.deleteCategory(actor, categoryId);
  }

  @Get("exports")
  @UseGuards(AuthGuard)
  listExports(
    @CurrentActor() actor: AuthActor,
    @Query("limit") limit?: string,
  ): Promise<PersonalFinanceExportSummary[]> {
    return this.finance.listExports(actor, limit);
  }

  @Post("exports")
  @UseGuards(AuthGuard)
  createExport(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createPersonalFinanceExportRequestSchema))
    body: CreatePersonalFinanceExportRequest,
  ): Promise<PersonalFinanceExportSummary> {
    return this.finance.createExport(actor, body);
  }

  @Get("exports/:exportId")
  @UseGuards(AuthGuard)
  getExport(
    @CurrentActor() actor: AuthActor,
    @Param("exportId") exportId: string,
  ): Promise<PersonalFinanceExportSummary> {
    return this.finance.getExport(actor, exportId);
  }

  @Get("exports/:exportId/file")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Download personal finance CSV bytes" })
  @Header("Content-Type", "text/csv; charset=utf-8")
  async downloadExport(
    @CurrentActor() actor: AuthActor,
    @Param("exportId") exportId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { csvBody, filename } = await this.finance.exportFilePayload(
      actor,
      exportId,
    );
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.send(csvBody);
  }

  @Get("income-sources")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List personal income sources (S11-10)" })
  listIncomeSources(@CurrentActor() actor: AuthActor): Promise<IncomeSourceSummary[]> {
    return this.finance.listIncomeSources(actor);
  }

  @Post("income-sources")
  @UseGuards(AuthGuard)
  createIncomeSource(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createIncomeSourceRequestSchema))
    body: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.finance.createIncomeSource(actor, body);
  }

  @Patch("income-sources/:sid")
  @UseGuards(AuthGuard)
  updateIncomeSource(
    @CurrentActor() actor: AuthActor,
    @Param("sid") sid: string,
    @Body(new ZodValidationPipe(updateIncomeSourceRequestSchema))
    body: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.finance.updateIncomeSource(actor, sid, body);
  }

  @Get("savings-goals")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List savings goals with computed progress (S11-10)" })
  listSavingsGoals(@CurrentActor() actor: AuthActor): Promise<SavingsGoalSummary[]> {
    return this.finance.listSavingsGoals(actor);
  }

  @Post("savings-goals")
  @UseGuards(AuthGuard)
  createSavingsGoal(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createSavingsGoalRequestSchema))
    body: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return this.finance.createSavingsGoal(actor, body);
  }

  @Patch("savings-goals/:gid")
  @UseGuards(AuthGuard)
  updateSavingsGoal(
    @CurrentActor() actor: AuthActor,
    @Param("gid") gid: string,
    @Body(new ZodValidationPipe(updateSavingsGoalRequestSchema))
    body: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return this.finance.updateSavingsGoal(actor, gid, body);
  }

  @Post("savings-goals/:gid/contributions")
  @UseGuards(AuthGuard)
  addGoalContribution(
    @CurrentActor() actor: AuthActor,
    @Param("gid") gid: string,
    @Body(new ZodValidationPipe(createSavingsGoalContributionRequestSchema))
    body: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    return this.finance.addGoalContribution(actor, gid, body);
  }

  @Get("alerts")
  @UseGuards(AuthGuard)
  listAlerts(@CurrentActor() actor: AuthActor): Promise<SpendingAlertSummary[]> {
    return this.finance.listAlerts(actor);
  }

  @Put("alerts")
  @UseGuards(AuthGuard)
  putAlerts(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(putSpendingAlertsRequestSchema))
    body: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]> {
    return this.finance.putAlerts(actor, body);
  }

  @Get("monthly-close")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Monthly close analysis (S11-10)" })
  getMonthlyClose(
    @CurrentActor() actor: AuthActor,
    @Query("yearMonth") yearMonth?: string,
  ): Promise<MonthlyCloseSummary> {
    return this.finance.getMonthlyClose(actor, yearMonth);
  }

  @Post("monthly-close/recompute")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Idempotent monthly close recompute from raw data" })
  recomputeMonthlyClose(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(recomputeMonthlyCloseRequestSchema))
    body: { yearMonth: string },
  ): Promise<MonthlyCloseSummary> {
    return this.finance.recomputeMonthlyClose(actor, body.yearMonth);
  }
}
