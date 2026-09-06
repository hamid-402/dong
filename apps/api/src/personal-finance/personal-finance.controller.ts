import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  aggregatePersonalFinanceTrends,
  buildPersonalOverviewCsv,
  shouldNotifyPersonalBudgetAlert,
  spaceKindForTemplate,
  sumActorExpensesInRange,
  zeroIrr,
  type AuthActor,
  type CreatePersonalCategoryRequest,
  type CreatePersonalFinanceExportRequest,
  type CreatePersonalMoneyAccountRequest,
  type CreatePersonalMoneyTxnRequest,
  type CreatePersonalTransferRequest,
  type PersonalBudgetAlertLevel,
  type PersonalBudgetSummary,
  type PersonalCategorySummary,
  type PersonalFinanceExportSummary,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceTrendGroupBy,
  type PersonalFinanceTrendsResponse,
  type PersonalFinanceWorkspaceLine,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
  type UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "./personal-resources.types.js";

@ApiTags("personal-finance")
@Controller("me/finance")
export class PersonalFinanceController {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(PERSONAL_RESOURCES_STORE)
    private readonly resources: PersonalResourcesStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get("overview")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Cross-workspace personal finance: paid/share in range + current net per workspace",
  })
  async overview(
    @CurrentActor() actor: AuthActor,
    @Query("from") from: string,
    @Query("to") to: string,
  ): Promise<PersonalFinanceOverviewResponse> {
    return this.buildOverview(actor, from, to);
  }

  @Get("trends")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Time-series personal finance: group paid/share + personal expenses",
  })
  async trends(
    @CurrentActor() actor: AuthActor,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("groupBy") groupByRaw?: string,
  ): Promise<PersonalFinanceTrendsResponse> {
    this.assertRange(from, to);
    const groupBy = this.parseTrendGroupBy(groupByRaw);
    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    const groupExpenses = [];
    for (const workspace of workspaces) {
      const rows = await this.expenses.listForWorkspace(workspace.id, actor.userId);
      groupExpenses.push(...rows);
    }
    const personalTxns = await this.resources.listTxns(actor.userId, {
      from,
      to,
      limit: 10_000,
    });
    const aggregated = aggregatePersonalFinanceTrends({
      from,
      to,
      groupBy,
      groupExpenses,
      actorUserId: actor.userId,
      personalExpenseTxns: personalTxns.map((t) => ({
        kind: t.kind,
        amountMinor: BigInt(t.amount.amountMinor),
        occurredOn: t.occurredOn,
      })),
    });
    return {
      ...aggregated,
      source: {
        expense: this.expenses.persistence,
        personal: this.resources.persistence,
      },
    };
  }

  @Get("resources")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Personal accounts total + current month budget" })
  resourcesSummary(
    @CurrentActor() actor: AuthActor,
    @Query("yearMonth") yearMonth?: string,
  ): Promise<PersonalResourcesSummary> {
    const ym = yearMonth?.trim() || this.currentYearMonth();
    return this.mapErrors(() => this.resources.resourcesSummary(actor.userId, ym));
  }

  @Get("accounts")
  @UseGuards(AuthGuard)
  listAccounts(
    @CurrentActor() actor: AuthActor,
    @Query("includeArchived") includeArchived?: string,
  ): Promise<PersonalMoneyAccountSummary[]> {
    return this.resources.listAccounts(actor.userId, {
      includeArchived: includeArchived === "1" || includeArchived === "true",
    });
  }

  @Post("accounts")
  @UseGuards(AuthGuard)
  createAccount(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.mapErrors(() => this.resources.createAccount(actor.userId, body));
  }

  @Patch("accounts/:accountId")
  @UseGuards(AuthGuard)
  updateAccount(
    @CurrentActor() actor: AuthActor,
    @Param("accountId") accountId: string,
    @Body() body: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.mapErrors(() =>
      this.resources.updateAccount(actor.userId, accountId, body),
    );
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
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.resources.listTxns(actor.userId, {
      accountId,
      from,
      to,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Post("transactions")
  @UseGuards(AuthGuard)
  async createTxn(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary> {
    await this.assertOptionalLinks(actor.userId, body);
    const yearMonth = body.occurredOn?.slice(0, 7);
    let previousLevel: PersonalBudgetAlertLevel | undefined;
    if (body.kind === "expense" && yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const budgets = await this.resources.listBudgets(actor.userId);
      previousLevel = budgets.find((b) => b.yearMonth === yearMonth)?.alertLevel;
    }
    const created = await this.mapErrors(() =>
      this.resources.createTxn(actor.userId, body),
    );
    if (body.kind === "expense" && yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const budgets = await this.resources.listBudgets(actor.userId);
      const budget = budgets.find((b) => b.yearMonth === yearMonth);
      if (budget) {
        await this.maybeNotifyBudgetAlert(actor.userId, budget, previousLevel);
      }
    }
    return created;
  }

  @Post("transfers")
  @UseGuards(AuthGuard)
  createTransfer(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }> {
    return this.mapErrors(() => this.resources.createTransfer(actor.userId, body));
  }

  @Get("budgets")
  @UseGuards(AuthGuard)
  listBudgets(@CurrentActor() actor: AuthActor): Promise<PersonalBudgetSummary[]> {
    return this.resources.listBudgets(actor.userId);
  }

  @Post("budgets")
  @UseGuards(AuthGuard)
  async upsertBudget(
    @CurrentActor() actor: AuthActor,
    @Body() body: UpsertPersonalBudgetRequest,
  ): Promise<PersonalBudgetSummary> {
    const previous = (await this.resources.listBudgets(actor.userId)).find(
      (b) => b.yearMonth === body.yearMonth,
    );
    const budget = await this.mapErrors(() =>
      this.resources.upsertBudget(actor.userId, body),
    );
    await this.maybeNotifyBudgetAlert(actor.userId, budget, previous?.alertLevel);
    return budget;
  }

  @Get("categories")
  @UseGuards(AuthGuard)
  listCategories(@CurrentActor() actor: AuthActor): Promise<PersonalCategorySummary[]> {
    return this.resources.listCategories(actor.userId);
  }

  @Post("categories")
  @UseGuards(AuthGuard)
  createCategory(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.mapErrors(() => this.resources.createCategory(actor.userId, body));
  }

  @Patch("categories/:categoryId")
  @UseGuards(AuthGuard)
  updateCategory(
    @CurrentActor() actor: AuthActor,
    @Param("categoryId") categoryId: string,
    @Body() body: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.mapErrors(() =>
      this.resources.updateCategory(actor.userId, categoryId, body),
    );
  }

  @Delete("categories/:categoryId")
  @UseGuards(AuthGuard)
  async deleteCategory(
    @CurrentActor() actor: AuthActor,
    @Param("categoryId") categoryId: string,
  ): Promise<{ ok: true }> {
    await this.mapErrors(() => this.resources.deleteCategory(actor.userId, categoryId));
    return { ok: true };
  }

  @Get("exports")
  @UseGuards(AuthGuard)
  listExports(
    @CurrentActor() actor: AuthActor,
    @Query("limit") limit?: string,
  ): Promise<PersonalFinanceExportSummary[]> {
    const parsed = limit ? Number(limit) : undefined;
    return this.resources.listExports(
      actor.userId,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Post("exports")
  @UseGuards(AuthGuard)
  async createExport(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreatePersonalFinanceExportRequest,
  ): Promise<PersonalFinanceExportSummary> {
    const created = await this.mapErrors(() =>
      this.resources.createExport(actor.userId, body, async () => {
        const overview = await this.buildOverview(actor, body.from, body.to);
        const csvBody = buildPersonalOverviewCsv(
          overview.workspaces.map((line) => ({
            workspaceName: line.workspaceName,
            spaceKind: line.spaceKind,
            paidMinor: line.paid.amountMinor,
            shareMinor: line.share.amountMinor,
            netMinor: line.net.amountMinor,
            expenseCount: line.expenseCount,
          })),
        );
        return { csvBody, rowCount: overview.workspaces.length };
      }),
    );
    const { csvBody: _, ...summary } = created;
    return summary;
  }

  @Get("exports/:exportId")
  @UseGuards(AuthGuard)
  async getExport(
    @CurrentActor() actor: AuthActor,
    @Param("exportId") exportId: string,
  ): Promise<PersonalFinanceExportSummary> {
    const row = await this.resources.getExport(actor.userId, exportId);
    if (!row) throw new NotFoundException({ detail: "خروجی پیدا نشد" });
    const { csvBody: _, ...summary } = row;
    return summary;
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
    const row = await this.resources.getExport(actor.userId, exportId);
    if (!row?.csvBody || row.status !== "completed") {
      throw new NotFoundException({ detail: "فایل آماده نیست" });
    }
    reply.header(
      "Content-Disposition",
      `attachment; filename="dang-personal-${exportId.slice(0, 8)}.csv"`,
    );
    reply.send(row.csvBody);
  }

  private async maybeNotifyBudgetAlert(
    userId: string,
    budget: PersonalBudgetSummary,
    previousLevel: PersonalBudgetAlertLevel | undefined,
  ): Promise<void> {
    if (!shouldNotifyPersonalBudgetAlert(previousLevel, budget.alertLevel)) {
      return;
    }
    const personal = await this.iam.ensurePersonalWorkspace(userId);
    const title =
      budget.alertLevel === "exceeded" ? "بودجه ماهانه تمام شد" : "هشدار بودجه ماهانه";
    const body =
      budget.alertLevel === "exceeded"
        ? `بودجه ${budget.yearMonth} به سقف رسید (${budget.usedPercent}٪).`
        : `بودجه ${budget.yearMonth}: ${budget.usedPercent}٪ از سقف (آستانه ${budget.alertPercent}٪).`;
    await this.notifications.notify(userId, {
      workspaceId: personal.id,
      userId,
      channel: "in_app",
      title,
      body,
      metadata: {
        event: "personal.budget.alert",
        route: "/me",
        alertLevel: budget.alertLevel,
        yearMonth: budget.yearMonth,
      },
    });
  }

  private parseTrendGroupBy(raw?: string): PersonalFinanceTrendGroupBy {
    const value = (raw ?? "day").trim();
    if (value === "day" || value === "week" || value === "month") return value;
    throw new BadRequestException({ detail: "groupBy باید day|week|month باشد" });
  }

  private async buildOverview(
    actor: AuthActor,
    from: string,
    to: string,
  ): Promise<PersonalFinanceOverviewResponse> {
    this.assertRange(from, to);
    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    const lines: PersonalFinanceWorkspaceLine[] = [];
    let totalPaid = 0n;
    let totalShare = 0n;

    for (const workspace of workspaces) {
      const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId);
      const slice = sumActorExpensesInRange(expenses, actor.userId, from, to);
      const balanceLines = await this.ledger.balancesForWorkspace(
        workspace.id,
        actor.userId,
      );
      const myNet =
        balanceLines.find((line) => line.userId === actor.userId)?.net ?? zeroIrr();

      totalPaid += BigInt(slice.paid.amountMinor);
      totalShare += BigInt(slice.share.amountMinor);

      lines.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        template: workspace.template,
        spaceKind: spaceKindForTemplate(workspace.template),
        paid: slice.paid,
        share: slice.share,
        net: myNet,
        expenseCount: slice.expenseCount,
      });
    }

    lines.sort((a, b) => {
      const paidDiff = BigInt(b.paid.amountMinor) - BigInt(a.paid.amountMinor);
      if (paidDiff !== 0n) return paidDiff > 0n ? 1 : -1;
      return a.workspaceName.localeCompare(b.workspaceName, "fa");
    });

    return {
      from,
      to,
      currency: "IRR",
      totals: {
        paid: { amountMinor: totalPaid.toString(), currency: "IRR" },
        share: { amountMinor: totalShare.toString(), currency: "IRR" },
      },
      workspaces: lines,
      source: {
        expense: this.expenses.persistence,
        ledger: this.ledger.persistence,
      },
    };
  }

  private assertRange(from: string, to: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) {
      throw new BadRequestException({ detail: "from و to باید YYYY-MM-DD باشند" });
    }
    if (from > to) {
      throw new BadRequestException({ detail: "بازه تاریخ نامعتبر است" });
    }
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  private async assertOptionalLinks(
    userId: string,
    body: Pick<
      CreatePersonalMoneyTxnRequest,
      "linkedWorkspaceId" | "linkedExpenseId" | "linkedSettlementId"
    >,
  ): Promise<void> {
    const workspaceId = body.linkedWorkspaceId?.trim();
    const expenseId = body.linkedExpenseId?.trim();
    const settlementId = body.linkedSettlementId?.trim();
    if (!workspaceId && !expenseId && !settlementId) return;

    if ((expenseId || settlementId) && !workspaceId) {
      throw new BadRequestException({
        detail: "برای لینک خرج/تسویه، workspace لازم است",
      });
    }
    if (!workspaceId) return;

    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new BadRequestException({ detail: "عضویت فضای لینک‌شده پیدا نشد" });
    }

    if (expenseId) {
      const expenses = await this.expenses.listForWorkspace(workspaceId, userId);
      const expense = expenses.find((e) => e.id === expenseId);
      if (!expense) {
        throw new BadRequestException({ detail: "خرج لینک‌شده پیدا نشد" });
      }
      const paid =
        expense.paymentLines?.some((p) => p.userId === userId) ||
        expense.paidByUserId === userId;
      const shared = expense.splits.some((s) => s.userId === userId);
      if (!paid && !shared) {
        throw new BadRequestException({
          detail: "فقط خرج‌هایی که پرداخت یا سهم شماست قابل لینک‌اند",
        });
      }
    }

    if (settlementId) {
      const settlements = await this.settlements.listForWorkspace(workspaceId, userId);
      const settlement = settlements.find((s) => s.id === settlementId);
      if (!settlement) {
        throw new BadRequestException({ detail: "تسویه لینک‌شده پیدا نشد" });
      }
      if (settlement.fromUserId !== userId && settlement.toUserId !== userId) {
        throw new BadRequestException({
          detail: "فقط تسویه‌هایی که طرف آن هستید قابل لینک‌اند",
        });
      }
    }
  }

  private async mapErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "ACCOUNT_NOT_FOUND" || code === "CATEGORY_NOT_FOUND") {
        throw new NotFoundException({
          detail: code === "CATEGORY_NOT_FOUND" ? "دسته پیدا نشد" : "حساب پیدا نشد",
        });
      }
      const details: Record<string, string> = {
        IDEMPOTENCY: "idempotencyKey لازم است",
        ACCOUNT_NAME: "نام حساب نامعتبر است",
        ACCOUNT_ARCHIVED: "حساب بایگانی شده است",
        MONEY_AMOUNT: "مبلغ نامعتبر است",
        CURRENCY: "فقط IRR پشتیبانی می‌شود",
        DATE: "تاریخ باید YYYY-MM-DD باشد",
        DATE_RANGE: "بازه تاریخ نامعتبر است",
        YEAR_MONTH: "ماه باید YYYY-MM باشد",
        TRANSFER_SAME: "حساب مبدأ و مقصد باید متفاوت باشند",
        ALERT_PERCENT: "آستانه هشدار باید بین ۱ تا ۱۰۰ باشد",
        CATEGORY_NAME: "نام دسته نامعتبر است",
        CATEGORY_SLUG: "این نامک دسته تکراری است",
        EXPORT_KIND: "نوع خروجی نامعتبر است",
      };
      if (details[code]) {
        throw new BadRequestException({ detail: details[code] });
      }
      throw error;
    }
  }
}
