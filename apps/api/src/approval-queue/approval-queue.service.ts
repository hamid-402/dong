import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  isFinanceManagerRole,
  readProductFeatureFlags,
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

const EXPENSE_APPROVER_ROLES = new Set(["owner", "admin", "finance", "approver"]);

@Injectable()
export class ApprovalQueueService {
  constructor(
    @Inject(ADDON_CHARGE_STORE) private readonly addons: AddonChargeStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    private readonly access: WorkspaceAccessService,
    private readonly approvalSteps: ApprovalStepsService,
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
    const [charges, invoices, expenseRows, pendingSteps] = await Promise.all([
      flags.addonAck
        ? this.addons.list(workspaceId, actor.userId)
        : Promise.resolve([]),
      this.billing.listPendingApprovals(workspaceId, actor.userId),
      EXPENSE_APPROVER_ROLES.has(role)
        ? this.expenses.listForWorkspace(workspaceId, actor.userId, {
            viewAllPrivate: isFinanceManagerRole(role) || role === "approver",
          })
        : Promise.resolve([]),
      flags.approvalSteps
        ? this.approvalSteps.pending(workspaceId, actor.userId)
        : Promise.resolve([]),
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
          items.push({
            kind: "expense",
            id: expense.id,
            title: expense.title,
            amount: expense.total,
            status: expense.status,
            hrefHint: "expenses",
            createdAt: expense.createdAt,
          });
        }
      }
    }
    for (const step of pendingSteps) {
      const expense = expenseRows.find((row) => row.id === step.expenseId);
      items.push({
        kind: "expense",
        id: step.expenseId,
        title: expense?.title ?? `گام تأیید ${step.stepNo}`,
        amount: expense?.total,
        status: `step_${step.stepNo}_pending`,
        hrefHint: "expenses",
        createdAt: step.createdAt,
      });
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
