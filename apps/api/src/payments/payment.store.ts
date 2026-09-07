import type {
  CreatePaymentLinkRequest,
  PaymentLinkSummary,
  PaymentProviderId,
} from "@dang/contracts";
import { buildStubCheckoutUrl } from "@dang/contracts";

type StoredLink = PaymentLinkSummary & { idempotencyKey: string };

export type PendingZarinpalPayment = {
  authority: string;
  amountMinor: string;
  workspaceId: string;
  paymentLinkId?: string;
  status: "pending" | "verified";
  refId?: string;
  createdAt: string;
  verifiedAt?: string;
};

function toSummary(row: StoredLink): PaymentLinkSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    settlementId: row.settlementId,
    invoiceId: row.invoiceId,
    provider: row.provider,
    amount: row.amount,
    description: row.description,
    checkoutUrl: row.checkoutUrl,
    status: row.status,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export class MemoryPaymentStore implements PaymentStore {
  readonly persistence = "memory" as const;
  private readonly links = new Map<string, StoredLink>();
  private readonly pendingZarinpal = new Map<string, PendingZarinpalPayment>();

  create(
    provider: PaymentProviderId,
    input: CreatePaymentLinkRequest,
    options?: { checkoutUrl?: string; providerRef?: string },
  ): Promise<PaymentLinkSummary> {
    const existing = [...this.links.values()].find(
      (l) =>
        l.workspaceId === input.workspaceId &&
        l.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) {
      return Promise.resolve(toSummary(existing));
    }

    const id = crypto.randomUUID();
    const providerRef = options?.providerRef ?? `stub_${id.slice(0, 8)}`;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const checkoutUrl =
      options?.checkoutUrl ?? buildStubCheckoutUrl(id, input.returnUrl);
    const row: StoredLink = {
      id,
      workspaceId: input.workspaceId,
      settlementId: input.settlementId,
      invoiceId: input.invoiceId,
      provider,
      amount: input.amount,
      description: input.description.trim(),
      checkoutUrl,
      status: "created",
      providerRef,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.links.set(id, row);
    return Promise.resolve(toSummary(row));
  }

  list(workspaceId: string): Promise<PaymentLinkSummary[]> {
    return Promise.resolve(
      [...this.links.values()]
        .filter((l) => l.workspaceId === workspaceId)
        .map(toSummary),
    );
  }

  async savePendingZarinpal(input: {
    authority: string;
    amountMinor: string;
    workspaceId: string;
    paymentLinkId?: string;
  }): Promise<void> {
    const authority = input.authority.trim();
    if (!authority) throw new Error("ZARINPAL_AUTHORITY");
    this.pendingZarinpal.set(authority, {
      authority,
      amountMinor: input.amountMinor,
      workspaceId: input.workspaceId,
      paymentLinkId: input.paymentLinkId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  async findPendingZarinpal(authority: string): Promise<PendingZarinpalPayment | null> {
    return this.pendingZarinpal.get(authority.trim()) ?? null;
  }

  async markZarinpalVerified(authority: string, refId: string): Promise<PendingZarinpalPayment> {
    const existing = this.pendingZarinpal.get(authority.trim());
    if (!existing) throw new Error("ZARINPAL_UNKNOWN_AUTHORITY");
    const next: PendingZarinpalPayment = {
      ...existing,
      status: "verified",
      refId,
      verifiedAt: new Date().toISOString(),
    };
    this.pendingZarinpal.set(authority.trim(), next);
    return next;
  }

  async getLink(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<PaymentLinkSummary | null> {
    const row = this.links.get(paymentLinkId);
    if (!row || row.workspaceId !== workspaceId) return null;
    return toSummary(row);
  }

  async markLinkPaid(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<PaymentLinkSummary> {
    const row = this.links.get(paymentLinkId);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error("PAYMENT_LINK_NOT_FOUND");
    }
    if (row.status === "paid") return toSummary(row);
    const next: StoredLink = { ...row, status: "paid" };
    this.links.set(paymentLinkId, next);
    return toSummary(next);
  }
}

export type PaymentStore = {
  readonly persistence: "memory" | "postgres";
  create(
    provider: PaymentProviderId,
    input: CreatePaymentLinkRequest,
    options?: { checkoutUrl?: string; providerRef?: string },
  ): Promise<PaymentLinkSummary>;
  list(workspaceId: string): Promise<PaymentLinkSummary[]>;
  getLink(workspaceId: string, paymentLinkId: string): Promise<PaymentLinkSummary | null>;
  markLinkPaid(workspaceId: string, paymentLinkId: string): Promise<PaymentLinkSummary>;
  savePendingZarinpal(input: {
    authority: string;
    amountMinor: string;
    workspaceId: string;
    paymentLinkId?: string;
  }): Promise<void>;
  findPendingZarinpal(authority: string): Promise<PendingZarinpalPayment | null>;
  markZarinpalVerified(authority: string, refId: string): Promise<PendingZarinpalPayment>;
};

export const PAYMENT_STORE = Symbol("PAYMENT_STORE");
