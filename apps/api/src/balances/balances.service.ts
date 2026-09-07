import {
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  isZeroSumBalances,
  readProductFeatureFlags,
  settlementSuggestionsSatisfyGoldenRules,
  suggestMinimalSettlements,
  type AuthActor,
  type DebtSimplifySuggestionsResponse,
  type WorkspaceBalancesResponse,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";

@Injectable()
export class BalancesService {
  constructor(
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async getProvisional(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<WorkspaceBalancesResponse> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }

    const lines = await this.ledger.balancesForWorkspace(workspaceId, actor.userId);

    void this.notifications
      .notifyGroupDebtAlerts(workspaceId, actor.userId, lines)
      .catch(() => undefined);

    return {
      workspaceId,
      provisional: this.ledger.persistence !== "postgres",
      source: this.ledger.persistence === "postgres" ? "postgres_journal" : "memory_journal",
      currency: "IRR",
      lines,
      zeroSum: isZeroSumBalances(lines),
    };
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
