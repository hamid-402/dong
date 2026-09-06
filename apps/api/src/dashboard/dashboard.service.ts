import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  aggregateExpenseSpendInRange,
  defaultDashboardDateRange,
  irrMoney,
  spaceKindForTemplate,
  sumActorExpensesInRange,
  zeroIrr,
  type AuthActor,
  type PersonalDashboardResponse,
  type PersonalFinanceOverviewResponse,
  type PersonalFinanceWorkspaceLine,
  type WorkspaceDashboardResponse,
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

@Injectable()
export class DashboardService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(BalancesService) private readonly balances: BalancesService,
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

    const [expenses, settlementRows, notificationRows, members, balanceSnapshot] =
      await Promise.all([
        this.expenses.listForWorkspace(workspaceId, actor.userId),
        this.settlements.listForWorkspace(workspaceId, actor.userId),
        this.notifications.listForUser(workspaceId, actor.userId),
        this.iam.listMembers(workspaceId, actor.userId),
        this.balances.getProvisional(actor, workspaceId),
      ]);

    const spend = aggregateExpenseSpendInRange(expenses, from, to);

    let openCount = 0;
    let disputedCount = 0;
    let openTotal = 0n;
    for (const row of settlementRows) {
      if (row.status === "claimed" || row.status === "disputed") {
        openCount += 1;
        openTotal += BigInt(row.amount.amountMinor);
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
      source: {
        expense: this.expenses.persistence,
        ledger: this.ledger.persistence,
        settlement: this.settlements.persistence,
        notification: this.notifications.persistence,
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
