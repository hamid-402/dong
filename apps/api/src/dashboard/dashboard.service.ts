import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import {
  aggregateExpenseSpendInRange,
  buildWorkspaceMoneyPulse,
  defaultDashboardDateRange,
  irrMoney,
  isFinanceManagerRole,
  spaceKindForTemplate,
  sumActorExpensesInRange,
  zeroIrr,
  type AuthActor,
  type PersonalDashboardResponse,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceWorkspaceLine,
  type WorkspaceDashboardResponse,
  type WorkspaceMoneyMovement,
} from "@dang/contracts";
import { BalancesService } from "../balances/balances.service.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import {
  NOTIFICATION_STORE,
  type NotificationStore,
} from "../notifications/notification.store.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PERSONAL_GOALS_STORE,
  type PersonalGoalsStore,
} from "../personal-finance/personal-goals.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "../personal-finance/personal-resources.types.js";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(BalancesService) private readonly balances: BalancesService,
    @Optional()
    @Inject(PERSONAL_RESOURCES_STORE)
    private readonly personalResources?: PersonalResourcesStore,
    @Optional()
    @Inject(PERSONAL_GOALS_STORE)
    private readonly personalGoals?: PersonalGoalsStore,
  ) {}

  async workspaceDashboard(
    actor: AuthActor,
    workspaceId: string,
    fromRaw?: string,
    toRaw?: string,
  ): Promise<WorkspaceDashboardResponse> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }

    const { from, to } = this.resolveRange(fromRaw, toRaw);
    const spaceKind = spaceKindForTemplate(membership.template);

    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const myRole = members.find((m) => m.userId === actor.userId)?.role;
    const [expenses, settlementRows, notificationRows, balanceSnapshot] =
      await Promise.all([
        this.expenses.listForWorkspace(workspaceId, actor.userId, {
          viewAllPrivate: isFinanceManagerRole(myRole),
        }),
        this.settlements.listForWorkspace(workspaceId, actor.userId),
        this.notifications.listForUser(workspaceId, actor.userId),
        this.balances.getProvisional(actor, workspaceId),
      ]);

    const spend = aggregateExpenseSpendInRange(expenses, from, to);

    let openCount = 0;
    let disputedCount = 0;
    let openTotal = 0n;
    const movements: WorkspaceMoneyMovement[] = [];
    for (const row of settlementRows) {
      if (row.status === "claimed" || row.status === "disputed") {
        openCount += 1;
        openTotal += BigInt(row.amount.amountMinor);
        movements.push({
          id: row.id,
          kind: "settlement",
          title: `تسویه ${row.status === "disputed" ? "مورد اختلاف" : "باز"}`,
          amount: row.amount,
          direction: "out",
          occurredOn: row.createdAt.slice(0, 10),
          hrefHint: "settlements",
        });
      }
      if (row.status === "disputed") disputedCount += 1;
    }

    const actorNet =
      balanceSnapshot.lines.find((line) => line.userId === actor.userId)?.net ??
      zeroIrr();

    const recentExpenses = [...expenses]
      .sort((a, b) => {
        const byDate = b.occurredOn.localeCompare(a.occurredOn);
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        title: e.title,
        total: e.total,
        status: e.status,
        occurredOn: e.occurredOn,
      }));

    for (const e of expenses) {
      if (e.status !== "posted") continue;
      if (e.occurredOn < from || e.occurredOn > to) continue;
      movements.push({
        id: e.id,
        kind: "expense",
        title: e.title,
        amount: e.total,
        direction: "out",
        occurredOn: e.occurredOn,
        hrefHint: "expenses",
      });
    }

    let personalIncomeMinor = 0n;
    let personalExpenseMinor = 0n;
    let personalInvestmentMinor = 0n;
    let personalInstallmentMinor = 0n;
    let goalsContributedMinor = 0n;
    let personalPersistence: "memory" | "postgres" | undefined;

    if (this.personalResources) {
      personalPersistence = this.personalResources.persistence;
      const txns = await this.personalResources.listTxns(actor.userId, {
        from,
        to,
        limit: 200,
      });
      for (const txn of txns) {
        if (txn.kind === "income") {
          personalIncomeMinor += BigInt(txn.amount.amountMinor);
          movements.push({
            id: txn.id,
            kind: "income",
            title: txn.note?.trim() || txn.categoryName || "درآمد شخصی",
            amount: txn.amount,
            direction: "in",
            occurredOn: txn.occurredOn,
            hrefHint: "me-finance",
          });
        } else if (txn.kind === "expense") {
          personalExpenseMinor += BigInt(txn.amount.amountMinor);
          movements.push({
            id: txn.id,
            kind: "expense",
            title: txn.note?.trim() || txn.categoryName || "خرج شخصی",
            amount: txn.amount,
            direction: "out",
            occurredOn: txn.occurredOn,
            hrefHint: "me-finance",
          });
        } else if (txn.kind === "transfer_in" || txn.kind === "transfer_out") {
          movements.push({
            id: txn.id,
            kind: "transfer",
            title: txn.note?.trim() || "انتقال بین حساب‌ها",
            amount: txn.amount,
            direction: txn.kind === "transfer_in" ? "in" : "out",
            occurredOn: txn.occurredOn,
            hrefHint: "me-finance",
          });
        } else if (txn.kind === "investment") {
          personalInvestmentMinor += BigInt(txn.amount.amountMinor);
          movements.push({
            id: txn.id,
            kind: "investment",
            title: txn.note?.trim() || txn.categoryName || "سرمایه‌گذاری",
            amount: txn.amount,
            direction: "out",
            occurredOn: txn.occurredOn,
            hrefHint: "me-finance",
          });
        } else if (txn.kind === "installment") {
          personalInstallmentMinor += BigInt(txn.amount.amountMinor);
          movements.push({
            id: txn.id,
            kind: "installment",
            title: txn.note?.trim() || txn.categoryName || "قسط",
            amount: txn.amount,
            direction: "out",
            occurredOn: txn.occurredOn,
            hrefHint: "me-finance",
          });
        }
      }
    }

    const goalSnaps: Array<{
      id: string;
      name: string;
      target: { amountMinor: string; currency: "IRR" };
      contributed: { amountMinor: string; currency: "IRR" };
      progressPercent: number;
      status: "active" | "reached" | "archived";
    }> = [];
    if (this.personalGoals) {
      personalPersistence = personalPersistence ?? this.personalGoals.persistence;
      const goals = await this.personalGoals.listSavingsGoals(actor.userId);
      for (const goal of goals) {
        if (goal.status === "archived") continue;
        goalsContributedMinor += BigInt(goal.contributed.amountMinor);
        goalSnaps.push({
          id: goal.id,
          name: goal.name,
          target: goal.target,
          contributed: goal.contributed,
          progressPercent: goal.progressPercent,
          status: goal.status,
        });
        if (BigInt(goal.contributed.amountMinor) > 0n) {
          movements.push({
            id: goal.id,
            kind: "contribution",
            title: `هدف: ${goal.name}`,
            amount: goal.contributed,
            direction: "out",
            occurredOn: goal.createdAt.slice(0, 10),
            hrefHint: "me-finance",
          });
        }
      }
    }

    let liquidBalanceMinor = 0n;
    if (this.personalResources) {
      personalPersistence = personalPersistence ?? this.personalResources.persistence;
      const yearMonth = to.slice(0, 7);
      const resources = await this.personalResources.resourcesSummary(
        actor.userId,
        yearMonth,
      );
      liquidBalanceMinor = BigInt(resources.totalBalance.amountMinor);
    }

    const moneyPulse = buildWorkspaceMoneyPulse({
      spaceKind,
      postedSpend: spend.postedTotal,
      openSettlementTotal: irrMoney(openTotal),
      personalIncomeMinor,
      personalExpenseMinor,
      personalInvestmentMinor,
      personalInstallmentMinor,
      goalsContributedMinor,
      liquidBalanceMinor,
      goals: goalSnaps,
      moneyIntents: this.personalGoals
        ? await this.personalGoals.listMoneyIntents(actor.userId)
        : [],
      movements,
    });

    return {
      workspaceId,
      workspaceName: membership.name,
      from,
      to,
      actorNet,
      spend,
      settlements: {
        openCount,
        disputedCount,
        openTotal: irrMoney(openTotal),
      },
      activity: {
        unreadNotifications: notificationRows.filter((n) => !n.readAt).length,
        memberCount: members?.length ?? 0,
        recentExpenses,
      },
      balances: {
        zeroSum: balanceSnapshot.zeroSum,
        provisional: balanceSnapshot.provisional,
        source: balanceSnapshot.source,
      },
      moneyPulse,
      source: {
        expense: this.expenses.persistence,
        ledger: this.ledger.persistence,
        settlement: this.settlements.persistence,
        notification: this.notifications.persistence,
        personal: personalPersistence,
      },
    };
  }

  async personalDashboard(
    actor: AuthActor,
    fromRaw?: string,
    toRaw?: string,
  ): Promise<PersonalDashboardResponse> {
    const { from, to } = this.resolveRange(fromRaw, toRaw);
    const finance = await this.buildPersonalOverview(actor, from, to);
    return {
      from,
      to,
      finance,
      workspaceCount: finance.workspaces.length,
      source: finance.source,
    };
  }

  /** Same shape as PersonalFinanceController.buildOverview — store-backed. */
  private async buildPersonalOverview(
    actor: AuthActor,
    from: string,
    to: string,
  ): Promise<PersonalFinanceOverviewResponse> {
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
        openSettlements,
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
        paid: irrMoney(totalPaid),
        share: irrMoney(totalShare),
      },
      workspaces: lines,
      source: {
        expense: this.expenses.persistence,
        ledger: this.ledger.persistence,
      },
    };
  }

  private resolveRange(fromRaw?: string, toRaw?: string): { from: string; to: string } {
    const defaults = defaultDashboardDateRange();
    const from = fromRaw?.trim() || defaults.from;
    const to = toRaw?.trim() || defaults.to;
    this.assertRange(from, to);
    return { from, to };
  }

  private assertRange(from: string, to: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException({ detail: "from و to باید YYYY-MM-DD باشند" });
    }
    if (from > to) {
      throw new BadRequestException({ detail: "بازه تاریخ نامعتبر است" });
    }
  }
}
