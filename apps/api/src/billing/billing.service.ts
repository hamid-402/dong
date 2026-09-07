import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberInvoiceSummary,
} from "@dang/contracts";
import { isFinanceManagerRole } from "@dang/contracts";
import { MfaService } from "../auth/mfa.service.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { BILLING_STORE, type BillingStore } from "./billing.types.js";

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async createPeriod(
    actor: AuthActor,
    workspaceId: string,
    body: CreateExpensePeriodRequest,
  ): Promise<ExpensePeriodSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    this.assertPeriodInput(body);
    try {
      return await this.idempotency.run(
        `period.create:${workspaceId}`,
        actor.userId,
        body.idempotencyKey,
        async () => {
          const created = await this.billing.createPeriod(actor.userId, {
            ...body,
            workspaceId,
          });
          await this.audit.append({
            workspaceId,
            actorUserId: actor.userId,
            action: "period.create",
            targetType: "expense_period",
            targetId: created.id,
            result: "success",
            metadata: { kind: created.kind },
          });
          return created;
        },
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listPeriods(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<ExpensePeriodSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    return this.billing.listPeriods(workspaceId, actor.userId);
  }

  async generateInvoices(
    actor: AuthActor,
    workspaceId: string,
    periodId: string,
    body: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    if (!isFinanceManagerRole(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی / مادرخرج می‌تواند این کار را انجام دهد",
        status: 403,
      });
    }
    await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    try {
      const invoices = await this.billing.generateInvoices(
        workspaceId,
        periodId,
        actor.userId,
        body ?? {},
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "period.invoices.generate",
        targetType: "expense_period",
        targetId: periodId,
        result: "success",
        metadata: {
          count: invoices.length,
          sendForApproval: Boolean(body?.sendForApproval),
        },
      });
      return invoices;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listInvoices(
    actor: AuthActor,
    workspaceId: string,
    periodId: string,
  ): Promise<MemberInvoiceSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const invoices = await this.billing.listInvoices(
      workspaceId,
      periodId,
      actor.userId,
    );
    if (isFinanceManagerRole(role)) return invoices;
    return invoices.filter((invoice) => invoice.memberUserId === actor.userId);
  }

  async approveInvoice(
    actor: AuthActor,
    workspaceId: string,
    invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    try {
      return await this.billing.approveInvoice(workspaceId, invoiceId, actor.userId);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async disputeInvoice(
    actor: AuthActor,
    workspaceId: string,
    invoiceId: string,
    note?: string,
  ): Promise<MemberInvoiceSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    try {
      return await this.billing.disputeInvoice(
        workspaceId,
        invoiceId,
        actor.userId,
        note,
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async issueInvoice(
    actor: AuthActor,
    workspaceId: string,
    invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      const invoice = await this.billing.issueInvoice(workspaceId, invoiceId, actor.userId);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "invoice.issue",
        targetType: "member_invoice",
        targetId: invoiceId,
        result: "success",
      });
      await this.notifications.notify(actor.userId, {
        workspaceId,
        userId: invoice.memberUserId,
        channel: "in_app",
        title: "صورتحساب جدید",
        body: `صورتحساب دوره برای شما صادر شد · ${invoice.total.amountMinor} ریال`,
        metadata: { event: "invoice.issued", invoiceId },
      });
      return invoice;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async markInvoicePaid(
    actor: AuthActor,
    workspaceId: string,
    invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      const invoice = await this.billing.markInvoicePaid(
        workspaceId,
        invoiceId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "invoice.paid",
        targetType: "member_invoice",
        targetId: invoiceId,
        result: "success",
      });
      return invoice;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async closePeriod(
    actor: AuthActor,
    workspaceId: string,
    periodId: string,
    body: { requireAllPaid?: boolean } = {},
  ): Promise<ExpensePeriodSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      const period = await this.billing.closePeriod(
        workspaceId,
        periodId,
        actor.userId,
        body ?? {},
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "period.close",
        targetType: "expense_period",
        targetId: periodId,
        result: "success",
      });
      return period;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async cancelPeriod(
    actor: AuthActor,
    workspaceId: string,
    periodId: string,
  ): Promise<ExpensePeriodSummary> {
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    try {
      const period = await this.billing.cancelPeriod(
        workspaceId,
        periodId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "period.cancel",
        targetType: "expense_period",
        targetId: periodId,
        result: "success",
      });
      return period;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  private assertPeriodInput(body: CreateExpensePeriodRequest): void {
    if (!body.title?.trim() || body.title.trim().length > 120) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "عنوان دوره نامعتبر است",
        status: 400,
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(body.endsOn)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "بازه تاریخ نامعتبر است",
        status: 400,
      });
    }
    if (body.endsOn < body.startsOn) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "پایان دوره باید بعد از شروع باشد",
        status: 400,
      });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "idempotencyKey لازم است",
        status: 400,
      });
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      if (error.message === "PERIOD_NOT_FOUND" || error.message === "INVOICE_NOT_FOUND") {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "یافت نشد",
          status: 404,
        });
      }
      if (error.message === "PERIOD_STATUS" || error.message === "PERIOD_INVOICES_UNPAID") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "وضعیت دوره اجازه این کار را نمی‌دهد",
          status: 400,
          detail:
            error.message === "PERIOD_INVOICES_UNPAID"
              ? "همه صورتحساب‌ها باید پرداخت شده باشند"
              : undefined,
        });
      }
      if (error.message === "INVOICE_FORBIDDEN") {
        throw new ForbiddenException({
          type: "https://dang.local/problems/forbidden",
          title: "اجازه ندارید",
          status: 403,
        });
      }
      if (error.message === "INVOICE_STATUS") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "وضعیت صورتحساب اجازه این کار را نمی‌دهد",
          status: 400,
        });
      }
    }
    throw error;
  }
}
