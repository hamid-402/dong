import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateExpenseDraftRequest,
  ExpenseSummary,
} from "@dang/contracts";
import { readProductFeatureFlags, spaceKindForTemplate } from "@dang/contracts";
import { parseExpenseCsv, type ExpenseCsvImportRequest } from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "../attachments/attachment.store.js";
import { ApprovalStepsService } from "../approval-steps/approval-steps.module.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { resolveExpenseListOptions } from "./expense-list-options.js";
import {
  EXPENSE_POLICY_STORE,
  type ExpensePolicyStore,
} from "../expense-policy/expense-policy.types.js";
import {
  EXPENSE_STORE,
  toExpenseSummary,
  type ExpenseStore,
  type StoredExpense,
} from "./expense.types.js";

const COMPANY_POST_ROLES = new Set(["owner", "admin", "approver", "finance"]);

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(EXPENSE_POLICY_STORE) private readonly policies: ExpensePolicyStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(ApprovalStepsService) private readonly approvalSteps: ApprovalStepsService,
  ) {}

  async createDraft(
    actor: AuthActor,
    workspaceId: string,
    body: CreateExpenseDraftRequest,
  ): Promise<ExpenseSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);

    let requiresApproval = body.requiresApproval;
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    const visibility = body.visibility ?? "shared";
    if (
      readProductFeatureFlags(process.env).expensePolicy &&
      spaceKindForTemplate(workspace?.template) === "org" &&
      (visibility === "shared" || visibility === "company")
    ) {
      const policy = await this.policies.get(workspaceId, actor.userId);
      if (
        policy.approvalThresholdMinor !== null &&
        BigInt(body.total.amountMinor) >= BigInt(policy.approvalThresholdMinor)
      ) {
        requiresApproval = true;
      }
    }
    const payload: CreateExpenseDraftRequest = {
      ...body,
      workspaceId,
      requiresApproval:
        requiresApproval ?? (visibility === "company" ? true : undefined),
    };

    try {
      return await this.idempotency.run(
        `expense.draft:${workspaceId}`,
        actor.userId,
        body.idempotencyKey,
        async () => {
          const created = await this.expenses.createDraft(actor.userId, payload);
          await this.audit.append({
            workspaceId,
            actorUserId: actor.userId,
            action: "expense.draft.create",
            targetType: "expense",
            targetId: created.id,
            result: "success",
            metadata: {
              amountMinor: created.total.amountMinor,
              splitMethod: created.splitMethod,
            },
          });
          return toExpenseSummary(created);
        },
      );
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async submit(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    await this.assertReceiptPolicy(workspaceId, expenseId, actor.userId);
    try {
      const updated = await this.expenses.submit(workspaceId, expenseId, actor.userId);
      if (updated.requiresApproval) {
        await this.approvalSteps.createFirst(workspaceId, expenseId, actor.userId);
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.submit",
        targetType: "expense",
        targetId: updated.id,
        result: "success",
        metadata: { status: updated.status },
      });
      return toExpenseSummary(updated);
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async post(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    const memberRole = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(memberRole);
    await this.assertReceiptPolicy(workspaceId, expenseId, actor.userId);
    try {
      const { viewAllPrivate, role } = await resolveExpenseListOptions(
        this.iam,
        workspaceId,
        actor.userId,
      );
      const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      });
      const current = listed.find((e) => e.id === expenseId);
      if (!current) throw new Error("EXPENSE_NOT_FOUND");
      if (current.visibility === "company") {
        if (!role || !COMPANY_POST_ROLES.has(role)) {
          throw new ForbiddenException({
            detail: "ثبت نهایی خرج شرکتی فقط با نقش تأییدکننده/مدیر مجاز است",
          });
        }
      }
      if (current.requiresApproval && !current.approvedAt) {
        if (!role || !COMPANY_POST_ROLES.has(role)) {
          throw new ForbiddenException({
            detail: "این خرج پیش از ثبت نهایی نیاز به تأیید مدیر مالی یا تأییدکننده دارد",
          });
        }
        await this.expenses.approve(
          workspaceId,
          expenseId,
          actor.userId,
          { viewAllPrivate },
        );
      }
      const updated = await this.expenses.post(workspaceId, expenseId, actor.userId, {
        viewAllPrivate,
      });
      const summary = toExpenseSummary(updated);
      const journal = await this.ledger.postExpense(actor.userId, summary);
      if (summary.visibility === "company") {
        await this.procurement.applyCompanyExpenseSpend(
          workspaceId,
          summary.total.amountMinor,
          summary.budgetId,
        );
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.post",
        targetType: "expense",
        targetId: updated.id,
        result: "success",
        metadata: {
          status: updated.status,
          journalEntryId: journal.id,
          ledger: this.ledger.persistence === "postgres" ? "postgres_journal" : "memory_journal",
        },
      });
      await this.notifications.notifyExpensePosted(
        workspaceId,
        updated.paidByUserId,
        updated.title,
        updated.participantUserIds,
      );
      return summary;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.rethrowLifecycle(error);
    }
  }

  async reverse(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    try {
      const { viewAllPrivate } = await resolveExpenseListOptions(
        this.iam,
        workspaceId,
        actor.userId,
      );
      const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      });
      const current = listed.find((e) => e.id === expenseId);
      if (!current) throw new Error("EXPENSE_NOT_FOUND");
      if (current.status === "reversed") throw new Error("EXPENSE_STATUS");
      const updated = await this.expenses.reverse(workspaceId, expenseId, actor.userId, {
        viewAllPrivate,
      });
      if (current.status === "posted") {
        await this.ledger.reverseExpense(workspaceId, actor.userId, expenseId);
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.reverse",
        targetType: "expense",
        targetId: expenseId,
        result: "success",
        metadata: { previousStatus: current.status },
      });
      return toExpenseSummary(updated);
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async promotePrivateToCompany(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    const { viewAllPrivate, role } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    if (!role || !COMPANY_POST_ROLES.has(role)) {
      throw new ForbiddenException({
        detail: "تبدیل به خرج شرکتی فقط برای تأییدکننده/مدیر مجاز است",
      });
    }
    const listed = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate,
    });
    const current = listed.find((e) => e.id === expenseId);
    if (!current) throw new NotFoundException({ detail: "خرج پیدا نشد" });
    if (current.visibility !== "private") {
      throw new BadRequestException({ detail: "فقط خرج خصوصی قابل تبدیل به شرکتی است" });
    }
    const store = this.expenses as ExpenseStore & {
      updateVisibility?: (
        workspaceId: string,
        expenseId: string,
        visibility: "company",
        actorUserId: string,
        options?: { viewAllPrivate?: boolean },
      ) => Promise<StoredExpense>;
    };
    if (!store.updateVisibility) {
      throw new BadRequestException({ detail: "به‌روزرسانی visibility در این store فعال نیست" });
    }
    const updated = await store.updateVisibility(
      workspaceId,
      expenseId,
      "company",
      actor.userId,
      { viewAllPrivate },
    );
    await this.audit.append({
      workspaceId,
      actorUserId: actor.userId,
      action: "expense.reimburse.approve",
      targetType: "expense",
      targetId: updated.id,
      result: "success",
      metadata: { visibility: "company" },
    });
    return toExpenseSummary(updated);
  }

  async approve(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
  ): Promise<ExpenseSummary> {
    const { viewAllPrivate, role } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    if (!role || !COMPANY_POST_ROLES.has(role)) {
      throw new ForbiddenException({
        detail: "تأیید خرج فقط برای مدیر مالی یا تأییدکننده مجاز است",
      });
    }
    if (readProductFeatureFlags(process.env).approvalSteps) {
      const assigned = await this.approvalSteps.pending(workspaceId, actor.userId);
      if (!assigned.some((step) => step.expenseId === expenseId)) {
        throw new ForbiddenException({
          detail: "This approval step is assigned to another approver.",
        });
      }
    }
    try {
      const updated = await this.expenses.approve(
        workspaceId,
        expenseId,
        actor.userId,
        { viewAllPrivate },
      );
      await this.approvalSteps.approve(workspaceId, expenseId, actor.userId);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "expense.approve",
        targetType: "expense",
        targetId: expenseId,
        result: "success",
      });
      return toExpenseSummary(updated);
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<ExpenseSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    return this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate,
    });
  }

  async importCsv(actor: AuthActor, workspaceId: string, input: ExpenseCsvImportRequest) {
    if (!readProductFeatureFlags(process.env).expenseImport) {
      throw new ForbiddenException({ detail: "Set ENABLE_EXPENSE_IMPORT=1" });
    }
    const rows = parseExpenseCsv(input.csvText);
    const created: ExpenseSummary[] = [];
    for (const [index, row] of rows.entries()) {
      created.push(await this.createDraft(actor, workspaceId, {
        workspaceId,
        title: row.title,
        total: { amountMinor: (BigInt(row.amountToman) * 10n).toString(), currency: "IRR" },
        paidByUserId: actor.userId,
        splitMethod: "equal",
        participantUserIds: [actor.userId],
        occurredOn: row.occurredOn,
        visibility: row.visibility,
        idempotencyKey: `${input.idempotencyKey}:${index}`,
      }));
    }
    return { imported: created.length, expenses: created };
  }

  private async assertReceiptPolicy(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<void> {
    if (!readProductFeatureFlags(process.env).expensePolicy) return;
    const policy = await this.policies.get(workspaceId, actorUserId);
    if (policy.requireReceiptAboveMinor === null) return;
    const { viewAllPrivate } = await resolveExpenseListOptions(this.iam, workspaceId, actorUserId);
    const expense = (await this.expenses.listForWorkspace(workspaceId, actorUserId, { viewAllPrivate }))
      .find((row) => row.id === expenseId);
    if (!expense || BigInt(expense.total.amountMinor) < BigInt(policy.requireReceiptAboveMinor)) return;
    const attachments = await this.attachments.listForTarget(workspaceId, "expense", expenseId);
    if (attachments.length === 0) {
      throw new BadRequestException({
        type: "https://dang.local/problems/receipt-required",
        title: "RECEIPT_REQUIRED",
        status: 400,
        detail: "A receipt attachment is required by workspace policy.",
      });
    }
  }

  private rethrowLifecycle(error: unknown): never {
    if (error instanceof Error && error.message === "EXPENSE_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Expense not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_FORBIDDEN") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Expense action not allowed",
        status: 403,
        detail: "You cannot mutate this expense",
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid expense status transition",
        status: 400,
        detail: "Allowed: draft→submit, draft|submitted→post",
      });
    }
    if (error instanceof Error && error.message === "EXPENSE_APPROVAL_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Expense is not awaiting approval",
        status: 400,
      });
    }
    throw error;
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, string> = {
        EXPENSE_CURRENCY: "Only IRR is supported",
        EXPENSE_AMOUNT: "Amount must be a positive integer minor unit",
        EXPENSE_TITLE: "Title must be 1-120 characters",
        EXPENSE_PARTICIPANTS: "At least one participant is required",
        EXPENSE_IDEMPOTENCY: "Idempotency key is required",
        EXPENSE_DATE: "occurredOn must be YYYY-MM-DD",
        EXPENSE_PAYER: "paidByUserId is required",
        EXPENSE_SPLIT_SUM: "Split lines must sum to total",
        EXPENSE_SPLIT_PERCENT: "Percent split must use basis points summing to 10000",
        EXPENSE_SPLIT_SHARES: "Shares must be positive integers",
        EXPENSE_SPLIT_LINES: "splitLines required for amount/percent/shares",
        EXPENSE_SPLIT_METHOD: "Unsupported split method",
        EXPENSE_SPLIT_ITEMS: "Itemized expenses need receipt lines with assignees",
        EXPENSE_SPLIT_ITEM_TOTAL: "Itemized total must equal items + tip + tax − discount",
        EXPENSE_PAYMENT_AMOUNT: "Payment lines must be positive IRR amounts",
        EXPENSE_PAYMENT_SUM: "Payment lines must sum to total",
        EXPENSE_PRIVATE_ASSIGNEE: "Private expenses must have exactly one participant",
        EXPENSE_ORIGINAL_MONEY: "originalCurrency and originalAmountMinor must be provided together",
      };
      const detail = map[error.message];
      if (detail) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid expense draft",
          status: 400,
          detail,
        });
      }
    }
    throw error;
  }
}
