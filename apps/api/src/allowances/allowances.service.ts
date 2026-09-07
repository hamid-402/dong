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

function periodRange(
  kind: "week" | "month",
  now = new Date(),
): { startsOn: string; endsOn: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  if (kind === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else {
    const weekday = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  }
  return {
    startsOn: start.toISOString().slice(0, 10),
    endsOn: end.toISOString().slice(0, 10),
  };
}

@Injectable()
export class AllowancesService {
  constructor(
    @Inject(ALLOWANCE_STORE) private readonly allowances: AllowanceStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    private readonly access: WorkspaceAccessService,
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
      const { startsOn, endsOn } = periodRange(allowance.periodKind);
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
