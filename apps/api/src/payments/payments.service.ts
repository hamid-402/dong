import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  assertNoCustodyPayload,
  isFinanceManagerRole,
  type AuthActor,
  type CreatePaymentLinkRequest,
  type MembershipRole,
  type PaymentLinkSummary,
} from "@dang/contracts";
import { isZarinpalLive, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import {
  PAYMENT_STORE,
  type PaymentStore,
  type PendingZarinpalPayment,
} from "./payment.store.js";
import { zarinpalRequestPayment } from "./zarinpal.client.js";

const logger = createLogger("dang-api-payments");

/** Synthetic actor for PSP-driven invoice transitions (no interactive user). */
const ZARINPAL_SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000021";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
  ) {}

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
        return await this.store.create("stub", { ...body, workspaceId });
      }

      const callbackUrl =
        process.env.ZARINPAL_CALLBACK_URL?.trim() ||
        `${env.apiBaseUrl.replace(/\/api\/v1\/?$/, "")}/api/v1/payments/zarinpal/callback`;

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

    await this.applyVerifiedPaymentFollowOn(verified);
    return verified;
  }

  private async applyVerifiedPaymentFollowOn(
    pending: PendingZarinpalPayment,
  ): Promise<void> {
    if (!pending.paymentLinkId) {
      logger.warn("Zarinpal verified without paymentLinkId; no link/invoice follow-on", {
        authority: pending.authority,
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
      logger.error("Failed to mark payment link paid after Zarinpal verify", {
        detail,
        paymentLinkId: pending.paymentLinkId,
        workspaceId: pending.workspaceId,
      });
      return;
    }

    if (!link.invoiceId) return;

    try {
      await this.billing.markInvoicePaid(
        pending.workspaceId,
        link.invoiceId,
        ZARINPAL_SYSTEM_ACTOR,
      );
      logger.info("Invoice marked paid after Zarinpal verify", {
        invoiceId: link.invoiceId,
        paymentLinkId: link.id,
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail === "INVOICE_STATUS") {
        // Idempotent / already paid / not yet issued — verify still succeeded.
        logger.warn("Invoice not transitioned to paid after Zarinpal verify", {
          detail,
          invoiceId: link.invoiceId,
        });
        return;
      }
      logger.error("Failed to mark invoice paid after Zarinpal verify", {
        detail,
        invoiceId: link.invoiceId,
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
