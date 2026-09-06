import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  assertNoCustodyPayload,
  type AuthActor,
  type CreatePaymentLinkRequest,
  type PaymentLinkSummary,
} from "@dang/contracts";
import { isZarinpalLive, loadAppEnv } from "@dang/config";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { zarinpalRequestPayment } from "./zarinpal.client.js";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async createLink(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePaymentLinkRequest,
  ): Promise<PaymentLinkSummary> {
    await this.requireMember(workspaceId, actor.userId);
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
    await this.requireMember(workspaceId, actor.userId);
    return await this.store.list(workspaceId);
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
}
