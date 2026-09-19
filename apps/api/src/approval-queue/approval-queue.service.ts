import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  EXPENSE_APPROVER_ROLES,
  approvalQueueSlaHours,
  isFinanceManagerRole,
  meetsMakerCheckerThreshold,
  readProductFeatureFlags,
  withApprovalQueueSla,
  type ApprovalQueueItem,
  type AuthActor,
} from "@dang/contracts";
import {
  ADDON_CHARGE_STORE,
  type AddonChargeStore,
} from "../addon-charges/addon-charges.types.js";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { ApprovalStepsService } from "../approval-steps/approval-steps.module.js";
import { MakerCheckerService } from "../maker-checker/maker-checker.service.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";

const EXPENSE_APPROVER_ROLE_SET = new Set<string>(EXPENSE_APPROVER_ROLES);

@Injectable()
export class ApprovalQueueService {
  constructor(
    @Inject(ADDON_CHARGE_STORE) private readonly addons: AddonChargeStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    // ESM + Nest: bare class params can land undefined — inject by token.
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(ApprovalStepsService) private readonly approvalSteps: ApprovalStepsService,
    @Inject(MakerCheckerService) private readonly makerChecker: MakerCheckerService,
  ) {}

  async list(actor: AuthActor, workspaceId: string): Promise<ApprovalQueueItem[]> {
    const flags = readProductFeatureFlags(process.env);
    if (!flags.approvalQueue) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Approval queue is disabled",
        status: 403,
        detail: "Set ENABLE_APPROVAL_QUEUE=1 to enable this feature.",
      });
    }
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const [charges, invoices, expenseRows, pendingSteps, settlementRows, thresholdMinor] =
      await Promise.all([
        flags.addonAck
          ? this.addons.list(workspaceId, actor.userId)
          : Promise.resolve([]),
        this.billing.listPendingApprovals(workspaceId, actor.userId),
        EXPENSE_APPROVER_ROLE_SET.has(role)
          ? this.expenses.listForWorkspace(workspaceId, actor.userId, {
              viewAllPrivate: isFinanceManagerRole(role) || role === "approver",
            })
          : Promise.resolve([]),
        flags.approvalSteps
          ? this.approvalSteps.pending(workspaceId, actor.userId)
          : Promise.resolve([]),
        flags.makerChecker && this.makerChecker.enabled()
          ? this.settlements.listForWorkspace(workspaceId, actor.userId)
          : Promise.resolve([]),
        flags.makerChecker && this.makerChecker.enabled()
          ? this.makerChecker.resolveThresholdMinor(workspaceId, actor.userId)
          : Promise.resolve(null),
      ]);

    const items: ApprovalQueueItem[] = [];
    for (const charge of charges) {
      if (
        charge.status === "pending_ack" &&
        charge.targetMemberUserId === actor.userId
      ) {
        items.push({
          kind: "addon_charge",
          id: charge.id,
          title: charge.title,
          amount: charge.amount,
          status: charge.status,
          hrefHint: "addons",
          createdAt: charge.createdAt,
        });
      }
    }
    for (const invoice of invoices) {
      items.push({
        kind: "member_invoice",
        id: invoice.id,
        title: "صورتحساب عضو",
        amount: invoice.total,
        status: invoice.status,
        hrefHint: "invoices",
        createdAt: invoice.createdAt,
      });
    }
    if (!flags.approvalSteps) {
      for (const expense of expenseRows) {
        if (
          expense.requiresApproval &&
          (expense.status === "submitted" || expense.status === "draft")
        ) {
          if (
            flags.makerChecker &&
            this.makerChecker.enabled() &&
            expense.createdByUserId === actor.userId &&
            meetsMakerCheckerThreshold(expense.total.amountMinor, thresholdMinor)
          ) {
            // Four-eyes: maker cannot self-approve — omit dead-end row.
            continue;
          }
          const progress = await this.tierProgressFields(
            workspaceId,
            "expense",
            expense.id,
            expense.total.amountMinor,
            actor.userId,
          );
          items.push({
            kind: "expense",
            id: expense.id,
            title: expense.title,
            amount: expense.total,
            status: expense.status,
            hrefHint: "expenses",
            createdAt: expense.createdAt,
            ...progress,
          });
        }
      }
    }
    for (const step of pendingSteps) {
      const expense = expenseRows.find((row) => row.id === step.expenseId);
      if (
        flags.makerChecker &&
        this.makerChecker.enabled() &&
        expense?.createdByUserId === actor.userId &&
        expense?.total &&
        meetsMakerCheckerThreshold(expense.total.amountMinor, thresholdMinor)
      ) {
        continue;
      }
      const progress =
        expense?.total?.amountMinor != null
          ? await this.tierProgressFields(
              workspaceId,
              "expense",
              step.expenseId,
              expense.total.amountMinor,
              actor.userId,
            )
          : {};
      items.push({
        kind: "expense",
        id: step.expenseId,
        title: expense?.title ?? `گام تأیید ${step.stepNo}`,
        amount: expense?.total,
        status: `step_${step.stepNo}_pending`,
        hrefHint: "expenses",
        createdAt: step.createdAt,
        ...progress,
      });
    }

    if (flags.makerChecker && this.makerChecker.enabled()) {
      for (const settlement of settlementRows) {
        if (settlement.status !== "claimed") continue;
        if (
          !meetsMakerCheckerThreshold(settlement.amount.amountMinor, thresholdMinor)
        ) {
          continue;
        }
        const makerId = settlement.createdByUserId ?? settlement.fromUserId;
        if (makerId === actor.userId) continue;
        const canConfirm =
          isFinanceManagerRole(role) || actor.userId === settlement.toUserId;
        if (!canConfirm) continue;
        const progress = await this.tierProgressFields(
          workspaceId,
          "settlement",
          settlement.id,
          settlement.amount.amountMinor,
          actor.userId,
        );
        items.push({
          kind: "settlement",
          id: settlement.id,
          title: "تسویه — تأیید چهارچشم",
          amount: settlement.amount,
          status: "claimed_four_eyes",
          hrefHint: "settlements",
          createdAt: settlement.createdAt,
          ...progress,
        });
      }
    }

    const slaHours = approvalQueueSlaHours(process.env);
    const decorate = (item: ApprovalQueueItem): ApprovalQueueItem => ({
      ...item,
      ...withApprovalQueueSla(item.createdAt, slaHours),
    });

    return items
      .map(decorate)
      .sort((a, b) => {
        const breachDelta = Number(Boolean(b.slaBreached)) - Number(Boolean(a.slaBreached));
        if (breachDelta !== 0) return breachDelta;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  /** Same ACL as list; returns only the queue size for header/home badges. */
  async count(actor: AuthActor, workspaceId: string): Promise<{ count: number }> {
    try {
      const items = await this.list(actor, workspaceId);
      return { count: items.length };
    } catch {
      // Badge endpoint: never 500 — feature-off / ACL / DI / store errors → 0.
      return { count: 0 };
    }
  }

  private async tierProgressFields(
    workspaceId: string,
    requestType: string,
    requestId: string,
    amountMinor: string,
    actorUserId: string,
  ): Promise<Pick<ApprovalQueueItem, "approvalsHave" | "approvalsNeeded">> {
    if (!this.makerChecker.enabled()) return {};
    const progress = await this.makerChecker.approvalProgress({
      workspaceId,
      requestType,
      requestId,
      amountMinor,
      actorUserId,
    });
    return {
      approvalsHave: progress.approvalsHave,
      approvalsNeeded: progress.approvalsNeeded,
    };
  }
}
