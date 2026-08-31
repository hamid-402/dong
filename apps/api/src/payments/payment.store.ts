import type {
  CreatePaymentLinkRequest,
  PaymentLinkSummary,
  PaymentProviderId,
} from "@dang/contracts";
import { buildStubCheckoutUrl } from "@dang/contracts";

type StoredLink = PaymentLinkSummary & { idempotencyKey: string };

function toSummary(row: StoredLink): PaymentLinkSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    settlementId: row.settlementId,
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

export class MemoryPaymentStore {
  private readonly links = new Map<string, StoredLink>();

  create(
    provider: PaymentProviderId,
    input: CreatePaymentLinkRequest,
  ): PaymentLinkSummary {
    const existing = [...this.links.values()].find(
      (l) =>
        l.workspaceId === input.workspaceId &&
        l.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) {
      return toSummary(existing);
    }

    const id = crypto.randomUUID();
    const providerRef = `stub_${id.slice(0, 8)}`;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const row: StoredLink = {
      id,
      workspaceId: input.workspaceId,
      settlementId: input.settlementId,
      provider,
      amount: input.amount,
      description: input.description.trim(),
      checkoutUrl: buildStubCheckoutUrl(id, input.returnUrl),
      status: "created",
      providerRef,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.links.set(id, row);
    return toSummary(row);
  }

  list(workspaceId: string): PaymentLinkSummary[] {
    return [...this.links.values()]
      .filter((l) => l.workspaceId === workspaceId)
      .map(toSummary);
  }
}

export const PAYMENT_STORE = Symbol("PAYMENT_STORE");
