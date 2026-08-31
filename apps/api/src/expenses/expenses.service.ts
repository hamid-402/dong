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
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  EXPENSE_STORE,
  toExpenseSummary,
  type ExpenseStore,
} from "./expense.types.js";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async createDraft(
    actor: AuthActor,
    workspaceId: string,
    body: CreateExpenseDraftRequest,
  ): Promise<ExpenseSummary> {
    await this.requireMember(workspaceId, actor.userId);

    const payload: CreateExpenseDraftRequest = {
      ...body,
      workspaceId,
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
    await this.requireMember(workspaceId, actor.userId);
    try {
      const updated = await this.expenses.submit(workspaceId, expenseId, actor.userId);
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
    await this.requireMember(workspaceId, actor.userId);
    try {
      const updated = await this.expenses.post(workspaceId, expenseId, actor.userId);
      const summary = toExpenseSummary(updated);
      const journal = await this.ledger.postExpense(actor.userId, summary);
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
      this.rethrowLifecycle(error);
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<ExpenseSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.expenses.listForWorkspace(workspaceId, actor.userId);
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
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
    if (error instanceof Error && error.message === "EXPENSE_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid expense status transition",
        status: 400,
        detail: "Allowed: draft→submit, draft|submitted→post",
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
        EXPENSE_PAYMENT_AMOUNT: "Payment lines must be positive IRR amounts",
        EXPENSE_PAYMENT_SUM: "Payment lines must sum to total",
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
