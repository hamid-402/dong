import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  aggregatePersonalFinanceTrends,
  buildMonthLifestyleSnapshot,
  buildPersonalAnnualStatementPack,
  buildPersonalAnnualStatementPrintHtml,
  buildPersonalOverviewCsv,
  computeMonthlyCloseTotals,
  currentJalaliYearMonth,
  DEFAULT_ALLOCATION_PERCENTS,
  enrichSavingsGoalSummary,
  isSpendingAlertBreached,
  jalaliYearMonthDateBounds,
  jalaliYearMonthFromIsoDate,
  normalizeAllocationPercents,
  personalAnnualStatementToCsv,
  requireJalaliYearMonthFromIso,
  resolveYearMonthDateBounds,
  shouldNotifyPersonalBudgetAlert,
  shouldNotifySpendingAlert,
  spaceKindForTemplate,
  spaceKindToLifeDomain,
  spendingAlertPeriodBounds,
  sumActorExpensesInRange,
  zeroIrr,
  type AllocationPlanSummary,
  type AuthActor,
  type CreateIncomeSourceRequest,
  type CreateMoneyIntentRequest,
  type CreatePaycheckRequest,
  type CreatePersonalCategoryRequest,
  type CreatePersonalFinanceExportRequest,
  type CreatePersonalMoneyAccountRequest,
  type CreatePersonalMoneyTxnRequest,
  type CreatePersonalTransferRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type DepositPersonalSavingsFundRequest,
  type EnsurePersonalSavingsFundRequest,
  type IncomeSourceSummary,
  type LifeDomain,
  type MonthLifestyleSnapshot,
  type MonthlyCloseSummary,
  type PaycheckSummary,
  type PersonalAnnualStatementPack,
  type PersonalBudgetAlertLevel,
  type PersonalBudgetSummary,
  type PersonalCategorySummary,
  type PersonalFinanceExportSummary,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceOverviewScope,
  type PersonalFinanceTrendGroupBy,
  type PersonalFinanceTrendsResponse,
  type PersonalFinanceWorkspaceLine,
  type PersonalMoneyAccountSummary,
  type PersonalMoneyTxnSummary,
  type PersonalResourcesSummary,
  type PersonalSavingsFundSummary,
  type PutAllocationPlanRequest,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalSummary,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdateMoneyIntentRequest,
  type UpdatePersonalCategoryRequest,
  type UpdatePersonalMoneyAccountRequest,
  type UpdateSavingsGoalRequest,
  type UpsertPersonalBudgetRequest,
} from "@dang/contracts";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PERSONAL_GOALS_STORE,
  type PersonalGoalsStore,
} from "./personal-goals.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "./personal-resources.types.js";

@Injectable()
export class PersonalFinanceService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(PERSONAL_RESOURCES_STORE)
    private readonly resources: PersonalResourcesStore,
    @Inject(PERSONAL_GOALS_STORE) private readonly goals: PersonalGoalsStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  overview(
    actor: AuthActor,
    from: string,
    to: string,
    scopeRaw?: string,
  ): Promise<PersonalFinanceOverviewResponse> {
    return this.buildOverview(actor, from, to, this.parseOverviewScope(scopeRaw));
  }

  async trends(
    actor: AuthActor,
    from: string,
    to: string,
    groupByRaw?: string,
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

  resourcesSummary(
    actor: AuthActor,
    yearMonth?: string,
  ): Promise<PersonalResourcesSummary> {
    const ym = yearMonth?.trim() || this.currentYearMonth();
    return this.mapErrors(() => this.resources.resourcesSummary(actor.userId, ym));
  }

  listAccounts(
    actor: AuthActor,
    includeArchived?: string,
  ): Promise<PersonalMoneyAccountSummary[]> {
    return this.resources.listAccounts(actor.userId, {
      includeArchived: includeArchived === "1" || includeArchived === "true",
    });
  }

  createAccount(
    actor: AuthActor,
    body: CreatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.mapErrors(() => this.resources.createAccount(actor.userId, body));
  }

  updateAccount(
    actor: AuthActor,
    accountId: string,
    body: UpdatePersonalMoneyAccountRequest,
  ): Promise<PersonalMoneyAccountSummary> {
    return this.mapErrors(() =>
      this.resources.updateAccount(actor.userId, accountId, body),
    );
  }

  listTxns(
    actor: AuthActor,
    opts: {
      accountId?: string;
      from?: string;
      to?: string;
      limit?: string;
    },
  ): Promise<PersonalMoneyTxnSummary[]> {
    const parsedLimit = opts.limit ? Number(opts.limit) : undefined;
    return this.resources.listTxns(actor.userId, {
      accountId: opts.accountId,
      from: opts.from,
      to: opts.to,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  async createTxn(
    actor: AuthActor,
    body: CreatePersonalMoneyTxnRequest,
  ): Promise<PersonalMoneyTxnSummary> {
    await this.assertOptionalLinks(actor.userId, body);
    const yearMonth =
      jalaliYearMonthFromIsoDate(body.occurredOn) ?? body.occurredOn?.slice(0, 7);
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
      await this.maybeNotifySpendingAlerts(actor.userId, created.occurredOn, {
        categoryId: created.categoryId,
        linkedWorkspaceId: created.linkedWorkspaceId,
      });
    }
    return created;
  }

  createTransfer(
    actor: AuthActor,
    body: CreatePersonalTransferRequest,
  ): Promise<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }> {
    return this.mapErrors(() => this.resources.createTransfer(actor.userId, body));
  }

  listBudgets(actor: AuthActor): Promise<PersonalBudgetSummary[]> {
    return this.resources.listBudgets(actor.userId);
  }

  async upsertBudget(
    actor: AuthActor,
    body: UpsertPersonalBudgetRequest,
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

  listCategories(actor: AuthActor): Promise<PersonalCategorySummary[]> {
    return this.resources.listCategories(actor.userId);
  }

  createCategory(
    actor: AuthActor,
    body: CreatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.mapErrors(() => this.resources.createCategory(actor.userId, body));
  }

  updateCategory(
    actor: AuthActor,
    categoryId: string,
    body: UpdatePersonalCategoryRequest,
  ): Promise<PersonalCategorySummary> {
    return this.mapErrors(() =>
      this.resources.updateCategory(actor.userId, categoryId, body),
    );
  }

  async deleteCategory(
    actor: AuthActor,
    categoryId: string,
  ): Promise<{ ok: true }> {
    await this.mapErrors(() => this.resources.deleteCategory(actor.userId, categoryId));
    return { ok: true };
  }

  listExports(
    actor: AuthActor,
    limit?: string,
  ): Promise<PersonalFinanceExportSummary[]> {
    const parsed = limit ? Number(limit) : undefined;
    return this.resources.listExports(
      actor.userId,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  async createExport(
    actor: AuthActor,
    body: CreatePersonalFinanceExportRequest,
  ): Promise<PersonalFinanceExportSummary> {
    const created = await this.mapErrors(() =>
      this.resources.createExport(actor.userId, body, async () => {
        const overview = await this.buildOverview(actor, body.from, body.to, "combined");
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

  async getExport(
    actor: AuthActor,
    exportId: string,
  ): Promise<PersonalFinanceExportSummary> {
    const row = await this.resources.getExport(actor.userId, exportId);
    if (!row) throw new NotFoundException({ detail: "خروجی پیدا نشد" });
    const { csvBody: _, ...summary } = row;
    return summary;
  }

  async exportFilePayload(
    actor: AuthActor,
    exportId: string,
  ): Promise<{ csvBody: string; filename: string }> {
    const row = await this.resources.getExport(actor.userId, exportId);
    if (!row?.csvBody || row.status !== "completed") {
      throw new NotFoundException({ detail: "فایل آماده نیست" });
    }
    return {
      csvBody: row.csvBody,
      filename: `dang-personal-${exportId.slice(0, 8)}.csv`,
    };
  }

  listIncomeSources(actor: AuthActor): Promise<IncomeSourceSummary[]> {
    return this.goals.listIncomeSources(actor.userId);
  }

  createIncomeSource(
    actor: AuthActor,
    body: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.mapErrors(() => this.goals.createIncomeSource(actor.userId, body));
  }

  updateIncomeSource(
    actor: AuthActor,
    sourceId: string,
    body: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.mapErrors(() =>
      this.goals.updateIncomeSource(actor.userId, sourceId, body),
    );
  }

  async listMoneyIntents(actor: AuthActor) {
    return this.mapErrors(() => this.goals.listMoneyIntents(actor.userId));
  }

  async createMoneyIntent(actor: AuthActor, body: CreateMoneyIntentRequest) {
    return this.mapErrors(() => this.goals.createMoneyIntent(actor.userId, body));
  }

  async updateMoneyIntent(
    actor: AuthActor,
    intentId: string,
    body: UpdateMoneyIntentRequest,
  ) {
    return this.mapErrors(() => this.goals.updateMoneyIntent(actor.userId, intentId, body));
  }

    async listSavingsGoals(actor: AuthActor): Promise<SavingsGoalSummary[]> {
    const goals = await this.mapErrors(() =>
      this.goals.listSavingsGoals(actor.userId),
    );
    return Promise.all(
      goals.map((goal) => this.enrichGoalProgressFromLedger(actor.userId, goal)),
    );
  }

  createSavingsGoal(
    actor: AuthActor,
    body: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return this.mapErrors(() => this.goals.createSavingsGoal(actor.userId, body));
  }

  async updateSavingsGoal(
    actor: AuthActor,
    goalId: string,
    body: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    const goal = await this.mapErrors(() =>
      this.goals.updateSavingsGoal(actor.userId, goalId, body),
    );
    return this.enrichGoalProgressFromLedger(actor.userId, goal);
  }

  async addGoalContribution(
    actor: AuthActor,
    goalId: string,
    body: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    return this.mapErrors(async () => {
      let payload = body;
      const goals = await this.goals.listSavingsGoals(actor.userId);
      const existing = goals.find((g) => g.id === goalId);
      if (!existing) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "هدف پس‌انداز یافت نشد",
          status: 404,
        });
      }
      if (
        existing.accountId &&
        !body.txnId?.trim() &&
        existing.status !== "archived"
      ) {
        const occurredOn = body.occurredAt.slice(0, 10);
        const txn = await this.resources.createTxn(actor.userId, {
          accountId: existing.accountId,
          kind: "income",
          amount: { amountMinor: body.amountMinor, currency: "IRR" },
          occurredOn: /^\d{4}-\d{2}-\d{2}$/.test(occurredOn)
            ? occurredOn
            : new Date().toISOString().slice(0, 10),
          note: body.note?.trim() || `واریز به هدف: ${existing.name}`,
          idempotencyKey: `goal-contrib:${body.idempotencyKey}`,
        });
        payload = { ...body, txnId: txn.id };
      }
      const result = await this.goals.addContribution(
        actor.userId,
        goalId,
        payload,
      );
      return {
        goal: await this.enrichGoalProgressFromLedger(actor.userId, result.goal),
        contribution: result.contribution,
      };
    });
  }

  async getSavingsFundSummary(
    actor: AuthActor,
  ): Promise<PersonalSavingsFundSummary> {
    const goals = await this.listSavingsGoals(actor);
    return this.toSavingsFundSummary(goals);
  }

  async ensureDefaultSavingsFund(
    actor: AuthActor,
    body?: EnsurePersonalSavingsFundRequest,
  ): Promise<{
    created: boolean;
    fund: PersonalSavingsFundSummary;
  }> {
    const existing = await this.listSavingsGoals(actor);
    const active = existing.filter((g) => g.status === "active");
    if (active.length > 0) {
      return { created: false, fund: this.toSavingsFundSummary(existing) };
    }
    const name = body?.name?.trim() || "صندوق پس‌انداز";
    // Default ceiling: 100M تومان = 1_000_000_000 IRR minor
    const targetMinor = body?.targetMinor?.trim() || "1000000000";
    const created = await this.createSavingsGoal(actor, {
      name,
      targetMinor,
      idempotencyKey:
        body?.idempotencyKey?.trim() ||
        `ensure-default-savings:${actor.userId}`,
    });
    const goals = await this.listSavingsGoals(actor);
    const withCreated = goals.some((g) => g.id === created.id)
      ? goals
      : [created, ...goals];
    return { created: true, fund: this.toSavingsFundSummary(withCreated) };
  }

  async depositToSavingsFund(
    actor: AuthActor,
    body: DepositPersonalSavingsFundRequest,
  ): Promise<{
    fund: PersonalSavingsFundSummary;
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    let goals = await this.listSavingsGoals(actor);
    let target =
      (body.goalId
        ? goals.find((g) => g.id === body.goalId && g.status === "active")
        : null) ??
      goals.find((g) => g.status === "active" && g.name === "صندوق پس‌انداز") ??
      goals.find((g) => g.status === "active") ??
      null;
    if (!target) {
      const ensured = await this.ensureDefaultSavingsFund(actor, {
        idempotencyKey: `ensure-before-deposit:${body.idempotencyKey}`,
      });
      target = ensured.fund.defaultGoal;
      goals = ensured.fund.goals;
    }
    if (!target) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "صندوق پس‌انداز در دسترس نیست",
        status: 400,
        code: "SAVINGS_FUND_MISSING",
      });
    }
    const { goal, contribution } = await this.addGoalContribution(
      actor,
      target.id,
      {
        amountMinor: body.amountMinor,
        occurredAt: body.occurredAt?.trim() || new Date().toISOString(),
        note: body.note,
        idempotencyKey: body.idempotencyKey,
      },
    );
    const refreshed = await this.listSavingsGoals(actor);
    return {
      fund: this.toSavingsFundSummary(refreshed),
      goal,
      contribution,
    };
  }

  private toSavingsFundSummary(
    goals: SavingsGoalSummary[],
  ): PersonalSavingsFundSummary {
    const active = goals.filter((g) => g.status !== "archived");
    const balance = active.reduce(
      (acc, g) => acc + BigInt(g.contributed.amountMinor || "0"),
      0n,
    );
    const defaultGoal =
      active.find((g) => g.status === "active" && g.name === "صندوق پس‌انداز") ??
      active.find((g) => g.status === "active") ??
      active[0] ??
      null;
    return {
      balanceMinor: balance.toString(),
      currency: "IRR",
      goalCount: active.length,
      defaultGoal,
      goals: active,
    };
  }

  listAlerts(actor: AuthActor): Promise<SpendingAlertSummary[]> {
    return this.goals.listAlerts(actor.userId);
  }

  putAlerts(
    actor: AuthActor,
    body: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]> {
    return this.mapErrors(() => this.goals.putAlerts(actor.userId, body));
  }

  async getMonthlyClose(
    actor: AuthActor,
    yearMonth?: string,
  ): Promise<MonthlyCloseSummary> {
    const ym = yearMonth?.trim() || this.currentYearMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
      throw new BadRequestException({ detail: "ماه باید YYYY-MM باشد" });
    }
    const existing = await this.goals.getMonthlyClose(actor.userId, ym);
    if (existing) return existing;
    return this.recomputeMonthlyClose(actor, ym);
  }

  async recomputeMonthlyClose(
    actor: AuthActor,
    yearMonth: string,
  ): Promise<MonthlyCloseSummary> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      throw new BadRequestException({ detail: "ماه باید YYYY-MM باشد" });
    }
    const { from, to } = resolveYearMonthDateBounds(
      yearMonth,
      jalaliYearMonthDateBounds,
    );
    const txns = await this.resources.listTxns(actor.userId, {
      from,
      to,
      limit: 50_000,
    });
    let incomeMinor = 0n;
    let personalMinor = 0n;
    const categoryTotals = new Map<string, bigint>();
    for (const txn of txns) {
      const amount = BigInt(txn.amount.amountMinor);
      if (txn.kind === "income") incomeMinor += amount;
      // Installment is cash outflow for monthly close; investment stays allocation-only (pulse BI).
      if (txn.kind === "expense" || txn.kind === "installment") {
        personalMinor += amount;
        if (txn.kind === "expense" && txn.categoryId) {
          categoryTotals.set(
            txn.categoryId,
            (categoryTotals.get(txn.categoryId) ?? 0n) + amount,
          );
        }
      }
    }

    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    let groupShareMinor = 0n;
    for (const workspace of workspaces) {
      if (spaceKindForTemplate(workspace.template) === "personal") continue;
      const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId);
      const slice = sumActorExpensesInRange(expenses, actor.userId, from, to);
      groupShareMinor += BigInt(slice.share.amountMinor);
    }

    const savingsContributed = await this.goals.sumContributionsInRange(
      actor.userId,
      from,
      to,
    );
    const totals = computeMonthlyCloseTotals({
      incomeMinor,
      personalExpenseMinor: personalMinor,
      groupShareMinor,
    });
    // Prefer real savings contributions when present (lifestyle ledger); else inferred remainder.
    const savedMinor =
      savingsContributed > 0n ? savingsContributed : totals.savedMinor;
    let topCategoryId: string | null = null;
    let topAmount = 0n;
    for (const [categoryId, amount] of categoryTotals) {
      if (amount > topAmount) {
        topAmount = amount;
        topCategoryId = categoryId;
      }
    }

    return this.mapErrors(() =>
      this.goals.upsertMonthlyClose(actor.userId, {
        yearMonth,
        ...totals,
        savedMinor,
        topCategoryId,
        empty: totals.empty && savingsContributed === 0n,
        emptyReason:
          totals.empty && savingsContributed === 0n
            ? "برای این ماه تراکنش یا سهم گروهی ثبت نشده است"
            : undefined,
      }),
    );
  }

  async getAllocationPlan(actor: AuthActor): Promise<AllocationPlanSummary> {
    const existing = await this.mapErrors(() =>
      this.goals.getAllocationPlan(actor.userId),
    );
    if (existing) return existing;
    return {
      userId: actor.userId,
      percents: { ...DEFAULT_ALLOCATION_PERCENTS },
      updatedAt: new Date(0).toISOString(),
    };
  }

  putAllocationPlan(
    actor: AuthActor,
    body: PutAllocationPlanRequest,
  ): Promise<AllocationPlanSummary> {
    return this.mapErrors(() => this.goals.putAllocationPlan(actor.userId, body));
  }

  listPaychecks(
    actor: AuthActor,
    yearMonth?: string,
  ): Promise<PaycheckSummary[]> {
    return this.goals.listPaychecks(actor.userId, {
      yearMonth: yearMonth?.trim() || undefined,
    });
  }

  async createPaycheck(
    actor: AuthActor,
    body: CreatePaycheckRequest,
  ): Promise<PaycheckSummary> {
    return this.mapErrors(async () => {
      const yearMonth =
        body.yearMonth?.trim() || requireJalaliYearMonthFromIso(body.occurredOn);
      const fromIso = requireJalaliYearMonthFromIso(body.occurredOn);
      if (yearMonth !== fromIso) {
        throw new BadRequestException({
          detail: "yearMonth باید با ماه شمسی occurredOn یکی باشد",
        });
      }
      if (body.incomeSourceId) {
        const sources = await this.goals.listIncomeSources(actor.userId);
        if (!sources.some((s) => s.id === body.incomeSourceId)) {
          throw new BadRequestException({ detail: "منبع درآمد پیدا نشد" });
        }
      }

      const accounts = await this.resources.listAccounts(actor.userId);
      const active = accounts.filter((a) => !a.archived);
      let accountId = active[0]?.id;
      if (!accountId) {
        const created = await this.resources.createAccount(actor.userId, {
          name: "حساب اصلی",
          kind: "bank",
          openingBalance: { amountMinor: "0", currency: "IRR" },
          idempotencyKey: `paycheck-default-account:${actor.userId}`,
        });
        accountId = created.id;
      }

      const txn = await this.resources.createTxn(actor.userId, {
        accountId,
        kind: "income",
        amount: { amountMinor: body.amountMinor, currency: "IRR" },
        occurredOn: body.occurredOn,
        note: body.note?.trim() || "حقوق ماهانه",
        idempotencyKey: `paycheck-txn:${body.idempotencyKey}`,
      });

      return this.goals.createPaycheck(actor.userId, {
        ...body,
        yearMonth,
        moneyTxnId: txn.id,
      });
    });
  }

  async lifestyleSnapshot(
    actor: AuthActor,
    opts: { yearMonth?: string; from?: string; to?: string },
  ): Promise<MonthLifestyleSnapshot> {
    let yearMonth = opts.yearMonth?.trim();
    let from = opts.from?.trim();
    let to = opts.to?.trim();
    if (yearMonth) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
        throw new BadRequestException({ detail: "ماه باید YYYY-MM باشد" });
      }
      const bounds = resolveYearMonthDateBounds(yearMonth, jalaliYearMonthDateBounds);
      from = bounds.from;
      to = bounds.to;
    } else if (from && to) {
      this.assertRange(from, to);
      yearMonth = jalaliYearMonthFromIsoDate(from) ?? from.slice(0, 7);
    } else {
      yearMonth = this.currentYearMonth();
      const bounds = resolveYearMonthDateBounds(yearMonth, jalaliYearMonthDateBounds);
      from = bounds.from;
      to = bounds.to;
    }

    const plan = await this.getAllocationPlan(actor);
    const percents = normalizeAllocationPercents(plan.percents);
    const paychecks = await this.goals.listPaychecks(actor.userId, { yearMonth });
    const paycheckAmounts = paychecks.map((p) => BigInt(p.amount.amountMinor));

    const spendByDomain: Partial<Record<Exclude<LifeDomain, "savings">, bigint>> =
      {};
    const paidByDomain: Partial<Record<Exclude<LifeDomain, "savings">, bigint>> =
      {};

    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    for (const workspace of workspaces) {
      const kind = spaceKindForTemplate(workspace.template);
      const domain = spaceKindToLifeDomain(kind);
      const expenses = await this.expenses.listForWorkspace(
        workspace.id,
        actor.userId,
      );
      const slice = sumActorExpensesInRange(expenses, actor.userId, from, to);
      spendByDomain[domain] =
        (spendByDomain[domain] ?? 0n) + BigInt(slice.share.amountMinor);
      paidByDomain[domain] =
        (paidByDomain[domain] ?? 0n) + BigInt(slice.paid.amountMinor);
    }

    const personalTxns = await this.resources.listTxns(actor.userId, {
      from: from,
      to: to,
      limit: 50_000,
    });
    let personalExpense = 0n;
    for (const txn of personalTxns) {
      if (txn.kind === "expense" || txn.kind === "installment") {
        personalExpense += BigInt(txn.amount.amountMinor);
      }
    }
    spendByDomain.solo = (spendByDomain.solo ?? 0n) + personalExpense;

    const savingsContributed = await this.goals.sumContributionsInRange(
      actor.userId,
      from,
      to,
    );

    return buildMonthLifestyleSnapshot({
      yearMonth: yearMonth,
      from: from,
      to: to,
      percents,
      paycheckAmountsMinor: paycheckAmounts,
      spendByDomain,
      paidByDomain,
      savingsContributedMinor: savingsContributed,
      persistence: {
        paychecks: this.goals.persistence,
        workspaces: this.expenses.persistence,
        personal: this.resources.persistence,
        savings: this.goals.persistence,
      },
    });
  }

  async createAnnualStatement(
    actor: AuthActor,
    body: { jalaliYear: number; format: "csv" | "html_print" },
  ): Promise<{
    format: "csv" | "html_print";
    contentType: string;
    body: string;
    pack: PersonalAnnualStatementPack;
  }> {
    const year = body.jalaliYear;
    if (!Number.isInteger(year) || year < 1300 || year > 1699) {
      throw new BadRequestException({ detail: "سال شمسی نامعتبر است" });
    }
    const months: MonthLifestyleSnapshot[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const ym = `${year}-${String(m).padStart(2, "0")}`;
      months.push(await this.lifestyleSnapshot(actor, { yearMonth: ym }));
    }
    const from = months[0]!.from;
    const to = months[11]!.to;
    const goals = await this.listSavingsGoals(actor);
    const displayName = actor.displayName?.trim() || actor.userId.slice(0, 8);
    const pack = buildPersonalAnnualStatementPack({
      jalaliYear: year,
      from,
      to,
      displayName,
      issuedAtIso: new Date().toISOString(),
      months,
      goals: goals.map((g) => ({
        name: g.name,
        target: g.target,
        contributed: g.contributed,
        progressPercent: g.progressPercent,
        status: g.status,
      })),
    });
    if (body.format === "csv") {
      return {
        format: "csv",
        contentType: "text/csv; charset=utf-8",
        body: personalAnnualStatementToCsv(pack),
        pack,
      };
    }
    return {
      format: "html_print",
      contentType: "text/html; charset=utf-8",
      body: buildPersonalAnnualStatementPrintHtml(pack),
      pack,
    };
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

  /** Job/analytics sweep — evaluate all active alerts for one user (G07). */
  async runThresholdSweep(
    userId: string,
    asOfDay?: string,
  ): Promise<{ fired: number }> {
    const day = asOfDay ?? new Date().toISOString().slice(0, 10);
    const alerts = (await this.goals.listAlerts(userId)).filter((a) => a.active);
    let fired = 0;
    for (const alert of alerts) {
      const didFire = await this.processSpendingAlert(userId, day, alert, {});
      if (didFire) fired += 1;
    }
    return { fired };
  }

  private async maybeNotifySpendingAlerts(
    userId: string,
    occurredOn: string,
    ctx: { categoryId?: string; linkedWorkspaceId?: string },
  ): Promise<void> {
    const alerts = (await this.goals.listAlerts(userId)).filter((a) => a.active);
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      await this.processSpendingAlert(userId, occurredOn, alert, ctx);
    }
  }

  private async processSpendingAlert(
    userId: string,
    occurredOn: string,
    alert: SpendingAlertSummary,
    ctx: { categoryId?: string; linkedWorkspaceId?: string },
  ): Promise<boolean> {
    const { from, to } = spendingAlertPeriodBounds(alert.period, occurredOn);
    const spentMinor = await this.spentForAlert(userId, alert, from, to, ctx);
    const breached = isSpendingAlertBreached({
      spentMinor,
      limitMinor: BigInt(alert.limit.amountMinor),
      thresholdPercent: alert.thresholdPercent,
    });
    if (
      !shouldNotifySpendingAlert({
        breached,
        lastFiredAt: alert.lastFiredAt,
        periodFrom: from,
      })
    ) {
      return false;
    }
    const personal = await this.iam.ensurePersonalWorkspace(userId);
    const usedPercent =
      alert.limit.amountMinor === "0"
        ? 0
        : Number((spentMinor * 100n) / BigInt(alert.limit.amountMinor));
    await this.notifications.notify(userId, {
      workspaceId: personal.id,
      userId,
      channel: alert.channel === "email" ? "email" : "in_app",
      title: "هشدار سقف خرج",
      body: `خرج دوره از آستانه ${alert.thresholdPercent}٪ گذشت (${usedPercent}٪ از سقف).`,
      metadata: {
        event: "personal.spending.alert",
        route: "/me/finance",
        alertId: alert.id,
        scope: alert.scope,
        periodFrom: from,
        periodTo: to,
      },
    });
    await this.goals.markAlertFired(userId, alert.id);
    return true;
  }

  private async spentForAlert(
    userId: string,
    alert: SpendingAlertSummary,
    from: string,
    to: string,
    ctx: { categoryId?: string; linkedWorkspaceId?: string },
  ): Promise<bigint> {
    if (alert.scope === "total" || alert.scope === "category") {
      const txns = await this.resources.listTxns(userId, { from, to, limit: 50_000 });
      let sum = 0n;
      for (const txn of txns) {
        if (txn.kind !== "expense") continue;
        if (alert.scope === "category") {
          const ref = alert.refId ?? ctx.categoryId;
          if (!ref || txn.categoryId !== ref) continue;
        }
        sum += BigInt(txn.amount.amountMinor);
      }
      return sum;
    }

    const workspaces = await this.iam.listWorkspacesForUser(userId);
    let sum = 0n;
    for (const workspace of workspaces) {
      if (spaceKindForTemplate(workspace.template) === "personal") continue;
      if (alert.scope === "workspace") {
        const ref = alert.refId ?? ctx.linkedWorkspaceId;
        if (!ref || workspace.id !== ref) continue;
      }
      const expenses = await this.expenses.listForWorkspace(workspace.id, userId);
      const slice = sumActorExpensesInRange(expenses, userId, from, to);
      sum += BigInt(slice.share.amountMinor);
    }
    return sum;
  }

  private parseTrendGroupBy(raw?: string): PersonalFinanceTrendGroupBy {
    const value = (raw ?? "day").trim();
    if (value === "day" || value === "week" || value === "month") return value;
    throw new BadRequestException({ detail: "groupBy باید day|week|month باشد" });
  }

  private parseOverviewScope(raw?: string): PersonalFinanceOverviewScope {
    const value = (raw ?? "combined").trim();
    if (value === "personal" || value === "group" || value === "combined") return value;
    throw new BadRequestException({
      detail: "scope باید personal|group|combined باشد",
    });
  }

  private async buildOverview(
    actor: AuthActor,
    from: string,
    to: string,
    scope: PersonalFinanceOverviewScope,
  ): Promise<PersonalFinanceOverviewResponse> {
    this.assertRange(from, to);
    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    const lines: PersonalFinanceWorkspaceLine[] = [];

    for (const workspace of workspaces) {
      const expenses = await this.expenses.listForWorkspace(workspace.id, actor.userId);
      const slice = sumActorExpensesInRange(expenses, actor.userId, from, to);
      const balanceLines = await this.ledger.balancesForWorkspace(
        workspace.id,
        actor.userId,
      );
      const myNet =
        balanceLines.find((line) => line.userId === actor.userId)?.net ?? zeroIrr();
      const settlementRows = await this.settlements.listForWorkspace(
        workspace.id,
        actor.userId,
      );
      let openSettlements = 0;
      for (const row of settlementRows) {
        if (row.status === "claimed" || row.status === "disputed") {
          openSettlements += 1;
        }
      }

      lines.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        template: workspace.template,
        spaceKind: spaceKindForTemplate(workspace.template),
        paid: slice.paid,
        share: slice.share,
        net: myNet,
        expenseCount: slice.expenseCount,
        openSettlements,
      });
    }

    lines.sort((a, b) => {
      const paidDiff = BigInt(b.paid.amountMinor) - BigInt(a.paid.amountMinor);
      if (paidDiff !== 0n) return paidDiff > 0n ? 1 : -1;
      return a.workspaceName.localeCompare(b.workspaceName, "fa");
    });

    const personalTxns = await this.resources.listTxns(actor.userId, {
      from,
      to,
      limit: 50_000,
    });
    let personalIncome = 0n;
    let personalExpense = 0n;
    for (const txn of personalTxns) {
      const amount = BigInt(txn.amount.amountMinor);
      if (txn.kind === "income") personalIncome += amount;
      if (txn.kind === "expense") personalExpense += amount;
    }

    const filteredWorkspaces =
      scope === "personal"
        ? lines.filter((l) => l.spaceKind === "personal")
        : scope === "group"
          ? lines.filter((l) => l.spaceKind !== "personal")
          : lines;

    const scopedPaid = filteredWorkspaces.reduce(
      (acc, l) => acc + BigInt(l.paid.amountMinor),
      0n,
    );
    const scopedShare = filteredWorkspaces.reduce(
      (acc, l) => acc + BigInt(l.share.amountMinor),
      0n,
    );

    return {
      from,
      to,
      currency: "IRR",
      scope,
      totals: {
        paid: {
          amountMinor: (scope === "personal" ? 0n : scopedPaid).toString(),
          currency: "IRR",
        },
        share: {
          amountMinor: (scope === "personal" ? 0n : scopedShare).toString(),
          currency: "IRR",
        },
        ...(scope === "group"
          ? {}
          : {
              personalIncome: {
                amountMinor: personalIncome.toString(),
                currency: "IRR" as const,
              },
              personalExpense: {
                amountMinor: personalExpense.toString(),
                currency: "IRR" as const,
              },
            }),
      },
      workspaces: filteredWorkspaces,
      source: {
        expense: this.expenses.persistence,
        ledger: this.ledger.persistence,
        personal: this.resources.persistence,
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
    return currentJalaliYearMonth();
  }

  /**
   * When a goal is linked to a money account, fold income/transfer_in ledger
   * deposits into progress (orphan manual contributions still count).
   */
  private async enrichGoalProgressFromLedger(
    userId: string,
    goal: SavingsGoalSummary,
  ): Promise<SavingsGoalSummary> {
    if (!goal.accountId || goal.status === "archived") return goal;
    const from = goal.createdAt.slice(0, 10);
    const txns = await this.resources.listTxns(userId, {
      accountId: goal.accountId,
      from,
      limit: 50_000,
    });
    const ledgerSum = txns
      .filter((t) => t.kind === "income" || t.kind === "transfer_in")
      .reduce((sum, t) => sum + BigInt(t.amount.amountMinor), 0n);
    const contrib = BigInt(goal.contributed.amountMinor);
    const orphan = contrib > ledgerSum ? contrib - ledgerSum : 0n;
    if (ledgerSum === 0n && orphan === contrib) return goal;
    return enrichSavingsGoalSummary({
      id: goal.id,
      name: goal.name,
      targetMinor: BigInt(goal.target.amountMinor),
      contributionAmountMinors: orphan > 0n ? [orphan] : [],
      ledgerDepositMinors: ledgerSum > 0n ? [ledgerSum] : [],
      targetDate: goal.targetDate,
      accountId: goal.accountId,
      status: goal.status === "reached" ? "active" : goal.status,
      createdAt: goal.createdAt,
      reachedAt: goal.reachedAt,
    });
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
      if (
        code === "ACCOUNT_NOT_FOUND" ||
        code === "CATEGORY_NOT_FOUND" ||
        code === "INCOME_NOT_FOUND" ||
        code === "GOAL_NOT_FOUND" ||
        code === "INTENT_NOT_FOUND"
      ) {
        throw new NotFoundException({
          detail:
            code === "CATEGORY_NOT_FOUND"
              ? "دسته پیدا نشد"
              : code === "INCOME_NOT_FOUND"
                ? "منبع درآمد پیدا نشد"
                : code === "GOAL_NOT_FOUND"
                  ? "هدف پس‌انداز پیدا نشد"
                  : code === "INTENT_NOT_FOUND"
                    ? "قاعده مالی پیدا نشد"
                    : "حساب پیدا نشد",
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
        PAYCHECK_MONTH_EXISTS: "برای این ماه شمسی قبلاً حقوق ثبت شده است",
        ALLOCATION_SUM: "جمع درصدهای تخصیص باید ۱۰۰ باشد",
        ALLOCATION_PERCENT: "درصد تخصیص نامعتبر است",
        TRANSFER_SAME: "حساب مبدأ و مقصد باید متفاوت باشند",
        ALERT_PERCENT: "آستانه هشدار باید بین ۱ تا ۱۰۰ باشد",
        CATEGORY_NAME: "نام دسته نامعتبر است",
        CATEGORY_SLUG: "این نامک دسته تکراری است",
        EXPORT_KIND: "نوع خروجی نامعتبر است",
        INCOME_NAME: "نام منبع درآمد نامعتبر است",
        GOAL_NAME: "نام هدف نامعتبر است",
        GOAL_ARCHIVED: "هدف بایگانی شده است",
      };
      if (details[code]) {
        throw new BadRequestException({ detail: details[code] });
      }
      throw error;
    }
  }
}
