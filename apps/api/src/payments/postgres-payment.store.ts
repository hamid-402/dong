import {
  and,
  createDatabase,
  desc,
  eq,
  paymentLink,
  pendingZarinpalPayment,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreatePaymentLinkRequest,
  PaymentLinkSummary,
  PaymentProviderId,
} from "@dang/contracts";
import { buildStubCheckoutUrl } from "@dang/contracts";
import type { PaymentStore, PendingZarinpalPayment } from "./payment.store.js";

function mapPaymentLink(row: typeof paymentLink.$inferSelect): PaymentLinkSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    settlementId: row.settlementId ?? undefined,
    invoiceId: row.invoiceId ?? undefined,
    provider: row.provider,
    amount: { amountMinor: row.amountMinor.toString(), currency: row.currency as "IRR" },
    description: row.description,
    checkoutUrl: row.checkoutUrl,
    status: row.status,
    providerRef: row.providerRef,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function mapPending(
  row: typeof pendingZarinpalPayment.$inferSelect,
): PendingZarinpalPayment {
  return {
    authority: row.authority,
    amountMinor: row.amountMinor.toString(),
    workspaceId: row.workspaceId,
    paymentLinkId: row.paymentLinkId ?? undefined,
    status: row.status === "verified" ? "verified" : "pending",
    refId: row.refId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString(),
  };
}

export class PostgresPaymentStore implements PaymentStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPaymentStore {
    const { db } = createDatabase(connectionString);
    return new PostgresPaymentStore(db);
  }

  create(
    provider: PaymentProviderId,
    input: CreatePaymentLinkRequest,
    options?: { checkoutUrl?: string; providerRef?: string },
  ): Promise<PaymentLinkSummary> {
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const existing = await tx
        .select()
        .from(paymentLink)
        .where(
          and(
            eq(paymentLink.workspaceId, input.workspaceId),
            eq(paymentLink.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapPaymentLink(existing[0]);

      const id = crypto.randomUUID();
      const providerRef = options?.providerRef ?? `stub_${id.slice(0, 8)}`;
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
      const checkoutUrl =
        options?.checkoutUrl ?? buildStubCheckoutUrl(id, input.returnUrl);

      const inserted = await tx
        .insert(paymentLink)
        .values({
          id,
          workspaceId: input.workspaceId,
          settlementId: input.settlementId ?? null,
          invoiceId: input.invoiceId ?? null,
          provider,
          amountMinor: BigInt(input.amount.amountMinor),
          currency: input.amount.currency,
          description: input.description.trim(),
          checkoutUrl,
          status: "created",
          providerRef,
          returnUrl: input.returnUrl.trim(),
          idempotencyKey: input.idempotencyKey.trim(),
          expiresAt,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("PAYMENT_LINK_INSERT_FAILED");
      return mapPaymentLink(row);
    });
  }

  list(workspaceId: string): Promise<PaymentLinkSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(paymentLink)
        .where(eq(paymentLink.workspaceId, workspaceId))
        .orderBy(desc(paymentLink.createdAt));
      return rows.map(mapPaymentLink);
    });
  }

  async savePendingZarinpal(input: {
    authority: string;
    amountMinor: string;
    workspaceId: string;
    paymentLinkId?: string;
  }): Promise<void> {
    const authority = input.authority.trim();
    if (!authority) throw new Error("ZARINPAL_AUTHORITY");
    await this.db
      .insert(pendingZarinpalPayment)
      .values({
        authority,
        amountMinor: BigInt(input.amountMinor),
        workspaceId: input.workspaceId,
        paymentLinkId: input.paymentLinkId ?? null,
        status: "pending",
      })
      .onConflictDoNothing();
  }

  async findPendingZarinpal(authority: string): Promise<PendingZarinpalPayment | null> {
    const rows = await this.db
      .select()
      .from(pendingZarinpalPayment)
      .where(eq(pendingZarinpalPayment.authority, authority.trim()))
      .limit(1);
    return rows[0] ? mapPending(rows[0]) : null;
  }

  async markZarinpalVerified(
    authority: string,
    refId: string,
  ): Promise<PendingZarinpalPayment> {
    const updated = await this.db
      .update(pendingZarinpalPayment)
      .set({
        status: "verified",
        refId,
        verifiedAt: new Date(),
      })
      .where(eq(pendingZarinpalPayment.authority, authority.trim()))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("ZARINPAL_UNKNOWN_AUTHORITY");
    return mapPending(row);
  }
}
