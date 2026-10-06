import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  computeBalancesFromJournal,
  isZeroSumBalances,
  journalAsOfDay,
  readProductFeatureFlags,
  settlementSuggestionsSatisfyGoldenRules,
  suggestMinimalSettlements,
  type AuthActor,
  type DebtSimplifySuggestionsResponse,
  type JournalEntrySummary,
  type RemindDebtResponse,
  type WorkspaceBalancesResponse,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";

function filterEntriesAsOf(
  entries: readonly JournalEntrySummary[],
  asOf: string,
): JournalEntrySummary[] {
  return entries.filter((entry) => journalAsOfDay(entry) <= asOf);
}

@Injectable()
export class BalancesService {
  constructor(
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async getProvisional(
    actor: AuthActor,
    workspaceId: string,
    asOf?: string,
  ): Promise<WorkspaceBalancesResponse> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }

    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "asOf must be YYYY-MM-DD",
        status: 400,
      });
    }

    const entries = await this.ledger.listForWorkspace(workspaceId, actor.userId);
    const sliced = asOf ? filterEntriesAsOf(entries, asOf) : entries;
    const lines = computeBalancesFromJournal(sliced);

    if (!asOf) {
      void this.notifications
        .notifyGroupDebtAlerts(workspaceId, actor.userId, lines)
        .catch(() => undefined);
    }

    return {
      workspaceId,
      provisional: this.ledger.persistence !== "postgres",
      source: this.ledger.persistence === "postgres" ? "postgres_journal" : "memory_journal",
      currency: "IRR",
      lines,
      zeroSum: isZeroSumBalances(lines),
      ...(asOf ? { asOf } : {}),
    };
  }

  async remindDebt(
    actor: AuthActor,
    workspaceId: string,
    targetUserId: string,
  ): Promise<RemindDebtResponse> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const targetMembership = await this.iam.getWorkspaceForUser(workspaceId, targetUserId);
    if (!targetMembership) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Target is not a workspace member",
        status: 400,
      });
    }
    if (targetUserId === actor.userId) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Cannot remind yourself",
        status: 400,
      });
    }

    const lines = await this.ledger.balancesForWorkspace(workspaceId, actor.userId);
    const target = lines.find((line) => line.userId === targetUserId);
    const net = BigInt(target?.net.amountMinor ?? "0");
    if (net >= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Target is not a debtor",
        detail: "Reminders only apply when the member net balance is negative.",
        status: 400,
      });
    }

    return this.notifications.notifyDebtReminder(
      workspaceId,
      actor.userId,
      targetUserId,
      net.toString(),
    );
  }

  /**
   * Scheduled settle.remind (G11 #4): remind every debtor once (same daily skip as manual).
   * Actor must be finance/owner (same ACL as manual remind).
   */
  async runSettleRemindSweep(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<{ reminded: number; skipped: number }> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const lines = await this.ledger.balancesForWorkspace(workspaceId, actor.userId);
    let reminded = 0;
    let skipped = 0;
    for (const line of lines) {
      const net = BigInt(line.net.amountMinor);
      if (net >= 0n || line.userId === actor.userId) continue;
      if (line.userId.startsWith("fund:")) continue;
      const result = await this.notifications.notifyDebtReminder(
        workspaceId,
        actor.userId,
        line.userId,
        net.toString(),
      );
      if (result.skipped === "already_today") skipped += 1;
      else reminded += 1;
    }
    return { reminded, skipped };
  }

  async getSimplifySuggestions(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<DebtSimplifySuggestionsResponse> {
    this.assertSimplifyEnabled();
    const balances = await this.getProvisional(actor, workspaceId);
    const suggestions = suggestMinimalSettlements(balances.lines);
    return {
      workspaceId,
      currency: "IRR",
      lines: balances.lines,
      suggestions,
      goldenRulesOk: settlementSuggestionsSatisfyGoldenRules(
        balances.lines,
        suggestions,
      ),
      zeroSum: balances.zeroSum,
    };
  }

  private assertSimplifyEnabled(): void {
    if (!readProductFeatureFlags(process.env).debtSimplifyApi) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Debt simplify API disabled",
        detail: "Set ENABLE_DEBT_SIMPLIFY_API=1 to enable first-class simplify suggestions.",
        status: 403,
      });
    }
  }
}
