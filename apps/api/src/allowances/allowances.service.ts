import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  readProductFeatureFlags,
  type AuthActor,
  type CreateMemberAllowanceRequest,
  type MemberAllowanceSummary,
  type MemberAllowanceUsage,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { ALLOWANCE_STORE, type AllowanceStore } from "./allowances.types.js";
import {
  allowancePeriodRange,
  evaluateAllowanceOverLimit,
} from "./allowance-over-limit.js";

@Injectable()
export class AllowancesService {
  constructor(
    @Inject(ALLOWANCE_STORE) private readonly allowances: AllowanceStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
  ) {}

  async list(actor: AuthActor, workspaceId: string): Promise<MemberAllowanceSummary[]> {
    this.assertEnabled();
    await this.access.requireMember(workspaceId, actor.userId);
    return this.allowances.list(workspaceId, actor.userId);
  }

  async create(
    actor: AuthActor,
    workspaceId: string,
    input: CreateMemberAllowanceRequest,
  ): Promise<MemberAllowanceSummary> {
    this.assertEnabled();
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      return await this.allowances.create(workspaceId, actor.userId, input);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "ALLOWANCE_ACTIVE_EXISTS") {
        throw new BadRequestException({
          type: "https://dang.local/problems/allowance-active-exists",
          title: "برای این عضو و دوره محدودیت فعال وجود دارد",
          status: 400,
        });
      }
      throw error;
    }
  }

  async usage(actor: AuthActor, workspaceId: string): Promise<MemberAllowanceUsage[]> {
    this.assertEnabled();
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    const [allowances, expenses] = await Promise.all([
      this.allowances.list(workspaceId, actor.userId),
      this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate: true,
      }),
    ]);
    return allowances.map((allowance) => {
      const { startsOn, endsOn } = allowancePeriodRange(allowance.periodKind);
      const spentMinor = expenses.reduce((sum, expense) => {
        if (
          expense.status !== "posted" ||
          expense.occurredOn < startsOn ||
          expense.occurredOn > endsOn
        ) {
          return sum;
        }
        const participates =
          expense.paidByUserId === allowance.memberUserId ||
          expense.splits.some((line) => line.userId === allowance.memberUserId);
        return participates ? sum + BigInt(expense.total.amountMinor) : sum;
      }, 0n);
      const limitMinor = BigInt(allowance.limit.amountMinor);
      return {
        ...allowance,
        periodStartsOn: startsOn,
        spent: { amountMinor: spentMinor.toString(), currency: "IRR" },
        remaining: {
          amountMinor: (limitMinor > spentMinor ? limitMinor - spentMinor : 0n).toString(),
          currency: "IRR",
        },
        alertReached: spentMinor * 100n >= limitMinor * BigInt(allowance.alertPct),
      };
    });
  }

  /** Used by expense create/submit when ENABLE_ALLOWANCE=1 (lazy-loaded from ExpensesService). */
  async wouldExceedActiveAllowance(
    workspaceId: string,
    actorUserId: string,
    memberUserId: string,
    addedMinor: string,
    occurredOn: string,
  ): Promise<boolean> {
    if (!readProductFeatureFlags(process.env).allowance) return false;
    const [allowances, expenses] = await Promise.all([
      this.allowances.list(workspaceId, actorUserId),
      this.expenses.listForWorkspace(workspaceId, actorUserId, {
        viewAllPrivate: true,
      }),
    ]);
    return evaluateAllowanceOverLimit({
      allowances,
      expenses,
      memberUserId,
      addedMinor,
      occurredOn,
    }).overLimit;
  }

  private assertEnabled(): void {
    if (!readProductFeatureFlags(process.env).allowance) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Member allowances are disabled",
        status: 403,
        detail: "Set ENABLE_ALLOWANCE=1 to enable this feature.",
      });
    }
  }
}
