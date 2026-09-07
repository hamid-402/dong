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
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createPersonalCategoryRequestSchema,
  createPersonalFinanceExportRequestSchema,
  createPersonalMoneyAccountRequestSchema,
  createPersonalMoneyTxnRequestSchema,
  createPersonalTransferRequestSchema,
  updatePersonalCategoryRequestSchema,
  updatePersonalMoneyAccountRequestSchema,
  upsertPersonalBudgetRequestSchema,
  type AuthActor,
  type CreatePersonalCategoryRequest,
  type CreatePersonalFinanceExportRequest,
  type CreatePersonalMoneyAccountRequest,
  type CreatePersonalMoneyTxnRequest,
  type CreatePersonalTransferRequest,
  type PersonalBudgetSummary,
  type PersonalCategorySummary,
  type PersonalFinanceExportSummary,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceTrendsResponse,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
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
  ): Promise<PersonalFinanceOverviewResponse> {
    return this.finance.overview(actor, from, to);
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
}
