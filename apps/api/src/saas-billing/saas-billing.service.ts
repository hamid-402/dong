import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateSubscriptionInvoiceRequest,
  PaySubscriptionInvoiceRequest,
  PaymentLinkSummary,
  SaasUsageSnapshot,
  SubscriptionInvoiceSummary,
} from "@dang/contracts";
import {
  currentUtcPeriodMonth,
  isFinanceManagerRole,
  saasPlanPrice,
} from "@dang/contracts";
import { loadAppEnv, resolvePaymentProviderMode } from "@dang/config";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";
import {
  SAAS_BILLING_STORE,
  type SaasBillingStore,
} from "./saas-billing.store.js";
import { PostgresSaasBillingStore } from "./postgres-saas-billing.store.js";

@Injectable()
export class SaasBillingService {
  constructor(
    @Inject(SAAS_BILLING_STORE) private readonly store: SaasBillingStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Optional()
    @Inject(WaveFSettingsService)
    private readonly plans?: WaveFSettingsService,
  ) {}

  private pspLive(): boolean {
    const env = loadAppEnv();
    const mode = resolvePaymentProviderMode(env.zarinpalMerchantId);
    return mode === "local_psp" || mode === "zarinpal";
  }

  private syncPayableHint(): void {
    if (this.store instanceof PostgresSaasBillingStore) {
      this.store.setPayableHint(this.pspLive());
    }
  }

  async usage(actor: AuthActor, workspaceId: string): Promise<SaasUsageSnapshot> {
    await this.access.requireMember(workspaceId, actor.userId);
    const periodMonth = currentUtcPeriodMonth();
    const members = (await this.iam.listMembers(workspaceId, actor.userId)) ?? [];
    const plan = this.plans
      ? await this.plans.getPlan(actor, workspaceId)
      : { plan: "free" as const, seatsLimit: null };
    const list = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate: false,
    });
    const postedExpensesInPeriod = list.filter(
      (e) => e.status === "posted" && e.occurredOn.startsWith(periodMonth),
    ).length;
    return {
      workspaceId,
      periodMonth,
      seatsUsed: members.length,
      seatsLimit: plan.seatsLimit,
      postedExpensesInPeriod,
      measuredAt: new Date().toISOString(),
      sources: {
        seats: "iam.members",
        expenses: "expense.posted",
        plan: "workspace_plan",
      },
      currentPlan: plan.plan,
    };
  }

  async listInvoices(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<SubscriptionInvoiceSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    if (!isFinanceManagerRole(role) && role !== "auditor") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Subscription invoices restricted",
        status: 403,
      });
    }
    this.syncPayableHint();
    const rows = await this.store.listInvoices(workspaceId, actor.userId);
    const live = this.pspLive();
    return rows.map((r) => ({
      ...r,
      payable: live && r.status === "issued",
    }));
  }

  async createInvoice(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSubscriptionInvoiceRequest,
  ): Promise<SubscriptionInvoiceSummary> {
    await this.access.requireAccess(workspaceId, actor.userId, "saas.invoice.manage");
    const price = saasPlanPrice(body.targetPlan);
    if (BigInt(price.amountMinor) <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Free plan has no subscription invoice",
        status: 400,
      });
    }
    const live = this.pspLive();
    const mode = resolvePaymentProviderMode(loadAppEnv().zarinpalMerchantId);
    const note =
      mode === "zarinpal"
        ? "صورتحساب اشتراک — قابل پرداخت با زرین‌پال"
        : "صورتحساب اشتراک — قابل پرداخت با LocalPSP";
    this.syncPayableHint();
    return this.store.createInvoice({
      workspaceId,
      periodMonth: body.periodMonth,
      targetPlan: body.targetPlan,
      amountMinor: price.amountMinor,
      status: "issued",
      note,
      idempotencyKey: body.idempotencyKey,
      payable: live,
    });
  }

  async payInvoice(
    actor: AuthActor,
    workspaceId: string,
    invoiceId: string,
    body: PaySubscriptionInvoiceRequest,
  ): Promise<{ invoice: SubscriptionInvoiceSummary; paymentLink: PaymentLinkSummary }> {
    if (!this.pspLive()) {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/psp-unavailable",
        title: "PSP not available",
        status: 503,
        detail: "پرداخت اشتراک نیاز به LocalPSP یا زرین‌پال زنده دارد",
      });
    }
    await this.access.requireAccess(workspaceId, actor.userId, "saas.invoice.manage");
    this.syncPayableHint();
    const invoice = await this.store.getInvoice(workspaceId, invoiceId, actor.userId);
    if (!invoice) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Subscription invoice not found",
        status: 404,
      });
    }
    if (invoice.status !== "issued") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invoice is not payable",
        status: 400,
        detail: `status=${invoice.status}`,
      });
    }

    const paymentLink = await this.payments.createLink(actor, workspaceId, {
      workspaceId,
      amount: invoice.amount,
      description: `اشتراک ${invoice.targetPlan} · ${invoice.periodMonth}`,
      returnUrl: body.returnUrl,
      idempotencyKey: body.idempotencyKey,
    });

    const updated = await this.store.attachPaymentLink(
      workspaceId,
      invoiceId,
      paymentLink.id,
      actor.userId,
    );
    return {
      invoice: { ...updated, payable: true },
      paymentLink,
    };
  }

  /** Called after Zarinpal verify when payment link maps to a subscription invoice. */
  async completePaidFromPaymentLink(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<void> {
    let invoiceId: string | null = null;
    if (
      this.store instanceof PostgresSaasBillingStore &&
      "findInvoiceIdByPaymentLinkInWorkspace" in this.store
    ) {
      invoiceId = await this.store.findInvoiceIdByPaymentLinkInWorkspace(
        workspaceId,
        paymentLinkId,
      );
    } else {
      const mapped = await this.store.findInvoiceIdByPaymentLink(paymentLinkId);
      if (mapped?.workspaceId === workspaceId) invoiceId = mapped.invoiceId;
    }
    if (!invoiceId) return;

    const invoice = await this.store.markPaid(
      workspaceId,
      invoiceId,
      workspaceId,
    );
    if (this.plans) {
      await this.plans.applyPlanFromSubscription(workspaceId, invoice.targetPlan);
    }
  }
}
