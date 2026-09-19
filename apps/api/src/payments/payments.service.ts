import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from "@nestjs/common";
import {
  assertNoCustodyPayload,
  isFinanceManagerRole,
  type AuthActor,
  type CreatePaymentLinkRequest,
  type LocalPspIntentSummary,
  type LocalPspVerifyResponse,
  type MembershipRole,
  type PaymentLinkSummary,
} from "@dang/contracts";
import { isZarinpalLive, loadAppEnv, resolveZarinpalCallbackUrl, zarinpalCallbackMisconfig } from "@dang/config";
import { createLogger } from "@dang/observability";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { InvoiceEventsService } from "../billing/invoice-events.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PAYMENT_STORE,
  type PaymentStore,
  type PendingLocalPspPayment,
  type PendingZarinpalPayment,
} from "./payment.store.js";
import { zarinpalRequestPayment } from "./zarinpal.client.js";
import { confirmSettlementFromGateway, ZARINPAL_SYSTEM_ACTOR } from "./gateway-settlement-confirm.js";
import { SaasBillingService } from "../saas-billing/saas-billing.service.js";
import { LocalPspAdapter } from "./local-psp.adapter.js";

const logger = createLogger("dang-api-payments");

@Injectable()
export class PaymentsService {
  private readonly localPsp: LocalPspAdapter;

  constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(InvoiceEventsService)
    private readonly invoiceEvents: InvoiceEventsService,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Optional()
    @Inject(forwardRef(() => SaasBillingService))
    private readonly saasBilling?: SaasBillingService,
  ) {
    this.localPsp = new LocalPspAdapter(store);
  }

  async createLink(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePaymentLinkRequest,
  ): Promise<PaymentLinkSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    await this.assertCanCreatePaymentLink(actor.userId, workspaceId, role, body);
    assertNoCustodyPayload(body);

    if (body.amount.currency !== "IRR" || BigInt(body.amount.amountMinor) <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid payment amount",
        status: 400,
      });
    }
    if (!body.description?.trim() || body.description.trim().length > 200) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid payment description",
        status: 400,
      });
    }
    if (!body.returnUrl?.trim() || !/^https?:\/\//i.test(body.returnUrl)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "returnUrl must be an absolute URL",
        status: 400,
      });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "idempotencyKey required",
        status: 400,
      });
    }

    const env = loadAppEnv();
    const live = isZarinpalLive(env.zarinpalMerchantId);

    try {
      if (!live) {
        const { link } = await this.localPsp.createPaymentIntent({
          ...body,
          workspaceId,
        });
        return link;
      }

      const callbackUrl = resolveZarinpalCallbackUrl(env.apiBaseUrl);
      const misconfig = zarinpalCallbackMisconfig(callbackUrl);
      if (misconfig) {
        throw new ServiceUnavailableException({
          type: "https://dang.local/problems/psp-misconfigured",
          title: "Zarinpal callback URL is not production-ready",
          status: 503,
          detail: misconfig,
        });
      }

      const requested = await zarinpalRequestPayment({
        amountMinor: body.amount.amountMinor,
        description: body.description.trim(),
        callbackUrl,
        metadata: {
          workspaceId,
          settlementId: body.settlementId ?? "",
          invoiceId: body.invoiceId ?? "",
        },
      });

      const link = await this.store.create(
        "zarinpal",
        { ...body, workspaceId },
        {
          checkoutUrl: requested.checkoutUrl,
          providerRef: requested.authority,
        },
      );

      await this.store.savePendingZarinpal({
        authority: requested.authority,
        amountMinor: body.amount.amountMinor,
        workspaceId,
        paymentLinkId: link.id,
        returnUrl: body.returnUrl.trim(),
      });

      return link;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "PAYMENT_CUSTODY_FORBIDDEN") {
        throw new BadRequestException({
          type: "https://dang.local/problems/custody-forbidden",
          title: "Card/PAN fields are not accepted — PSP redirect only",
          status: 400,
        });
      }
      if (error instanceof Error && error.message.startsWith("ZARINPAL_")) {
        throw new ServiceUnavailableException({
          type: "https://dang.local/problems/psp-unavailable",
          title: "Zarinpal request failed",
          status: 503,
          detail: error.message,
        });
      }
      throw error;
    }
  }

  async listLinks(actor: AuthActor, workspaceId: string): Promise<PaymentLinkSummary[]> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const links = await this.store.list(workspaceId);
    if (isFinanceManagerRole(role)) return links;

    const settlements = await this.settlements.listForWorkspace(
      workspaceId,
      actor.userId,
    );
    const relatedSettlementIds = new Set(
      settlements
        .filter(
          (s) => s.fromUserId === actor.userId || s.toUserId === actor.userId,
        )
        .map((s) => s.id),
    );
    return links.filter(
      (link) =>
        Boolean(link.settlementId) && relatedSettlementIds.has(link.settlementId!),
    );
  }

  async getLocalPspIntent(intentId: string): Promise<LocalPspIntentSummary> {
    const pending = await this.store.findPendingLocalPsp(intentId.trim());
    if (!pending) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "LocalPSP intent not found",
        status: 404,
      });
    }
    return this.localPsp.toPublicSummary(pending);
  }

  /**
   * Checkout confirm → verify (idempotent) → settlement/invoice/SaaS follow-on.
   * Client amount is ignored; server-owned intent amount is authoritative.
   */
  async verifyLocalPsp(intentId: string): Promise<LocalPspVerifyResponse> {
    const { pending, response } = await this.localPsp.verify(intentId);
    if (!response.ok || !pending) return response;
    await this.applyVerifiedPaymentFollowOn({
      workspaceId: pending.workspaceId,
      paymentLinkId: pending.paymentLinkId,
    });
    return response;
  }

  /**
   * After PSP verify: mark pending verified, set linked payment_link to paid,
   * and mark linked invoice paid when present.
   */
  async completeZarinpalVerification(
    authority: string,
    refId: string,
  ): Promise<PendingZarinpalPayment> {
    const pending = await this.store.findPendingZarinpal(authority);
    if (!pending) throw new Error("ZARINPAL_UNKNOWN_AUTHORITY");

    const verified =
      pending.status === "verified"
        ? pending
        : await this.store.markZarinpalVerified(authority, refId);

    await this.applyVerifiedPaymentFollowOn({
      workspaceId: verified.workspaceId,
      paymentLinkId: verified.paymentLinkId,
    });
    return verified;
  }

  private async applyVerifiedPaymentFollowOn(pending: {
    workspaceId: string;
    paymentLinkId?: string;
  }): Promise<void> {
    if (!pending.paymentLinkId) {
      logger.warn("PSP verified without paymentLinkId; no link/invoice follow-on", {
        workspaceId: pending.workspaceId,
      });
      return;
    }

    let link: PaymentLinkSummary;
    try {
      link = await this.store.markLinkPaid(
        pending.workspaceId,
        pending.paymentLinkId,
      );
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("Failed to mark payment link paid after PSP verify", {
        detail,
        paymentLinkId: pending.paymentLinkId,
        workspaceId: pending.workspaceId,
      });
      return;
    }

    if (link.settlementId) {
      await confirmSettlementFromGateway({
        settlements: this.settlements,
        ledger: this.ledger,
        workspaceId: pending.workspaceId,
        settlementId: link.settlementId,
      });
    }

    if (link.invoiceId) {
      try {
        const paid = await this.billing.markInvoicePaid(
          pending.workspaceId,
          link.invoiceId,
          ZARINPAL_SYSTEM_ACTOR,
        );
        await this.invoiceEvents.announce({
          workspaceId: pending.workspaceId,
          periodId: paid.periodId,
          memberUserIds: [paid.memberUserId],
          reason: "invoice.paid.gateway",
        });
        logger.info("Invoice marked paid after PSP verify", {
          invoiceId: link.invoiceId,
          paymentLinkId: link.id,
        });
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail === "INVOICE_STATUS") {
          logger.warn("Invoice not transitioned to paid after PSP verify", {
            detail,
            invoiceId: link.invoiceId,
          });
        } else {
          logger.error("Failed to mark invoice paid after PSP verify", {
            detail,
            invoiceId: link.invoiceId,
          });
        }
      }
    }

    await this.completeSaasIfMapped(pending.workspaceId, link.id);
  }

  private async completeSaasIfMapped(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<void> {
    if (!this.saasBilling) return;
    try {
      await this.saasBilling.completePaidFromPaymentLink(workspaceId, paymentLinkId);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn("SaaS subscription follow-on after PSP verify skipped", {
        detail,
        workspaceId,
        paymentLinkId,
      });
    }
  }

  private async assertCanCreatePaymentLink(
    actorUserId: string,
    workspaceId: string,
    role: MembershipRole,
    body: CreatePaymentLinkRequest,
  ): Promise<void> {
    if (isFinanceManagerRole(role)) return;

    if (!body.settlementId?.trim()) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی یا طرف تسویه می‌تواند لینک پرداخت بسازد",
        status: 403,
      });
    }

    const settlement = await this.settlements.get(
      workspaceId,
      body.settlementId.trim(),
      actorUserId,
    );
    if (!settlement) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Settlement not found",
        status: 404,
      });
    }

    const isParty =
      actorUserId === settlement.fromUserId ||
      actorUserId === settlement.toUserId;
    if (!isParty) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی یا طرف تسویه می‌تواند لینک پرداخت بسازد",
        status: 403,
      });
    }
  }
}

/** Re-export for tests that need the pending type. */
export type { PendingLocalPspPayment };
