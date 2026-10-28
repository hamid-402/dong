import {
  and,
  createDatabase,
  desc,
  eq,
  paymentLink,
  pendingLocalPspPayment,
  pendingZarinpalPayment,
  sql,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreatePaymentLinkRequest,
  PaymentLinkSummary,
  PaymentProviderId,
} from "@dang/contracts";
import { buildStubCheckoutUrl } from "@dang/contracts";
import type {
  PaymentStore,
  PendingLocalPspPayment,
  PendingZarinpalPayment,
} from "./payment.store.js";

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
    returnUrl: row.returnUrl ?? undefined,
    status: row.status === "verified" ? "verified" : "pending",
    refId: row.refId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString(),
  };
}

function mapLocalPsp(
  row: typeof pendingLocalPspPayment.$inferSelect,
): PendingLocalPspPayment {
  return {
    intentId: row.intentId,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    description: row.description,
    returnUrl: row.returnUrl,
    workspaceId: row.workspaceId,
    paymentLinkId: row.paymentLinkId ?? undefined,
    status: row.status === "verified" ? "verified" : "pending",
    refId: row.refId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
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
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) =>
      this.insertPaymentLink(tx, provider, input, options),
    );
  }

  createWithPendingLocalPsp(
    input: CreatePaymentLinkRequest,
    options: { checkoutUrl: string; providerRef: string },
    pending: {
      intentId: string;
      amountMinor: string;
      currency?: string;
      description: string;
      returnUrl: string;
      expiresAt: string;
    },
  ): Promise<PaymentLinkSummary> {
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const link = await this.insertPaymentLink(tx, "local_psp", input, options);
      const intentId = pending.intentId.trim();
      if (!intentId) throw new Error("LOCAL_PSP_INTENT");
      await tx
        .insert(pendingLocalPspPayment)
        .values({
          intentId,
          amountMinor: BigInt(pending.amountMinor),
          currency: pending.currency ?? "IRR",
          description: pending.description.trim(),
          returnUrl: pending.returnUrl.trim(),
          workspaceId: input.workspaceId,
          paymentLinkId: link.id,
          status: "pending",
          expiresAt: new Date(pending.expiresAt),
        })
        .onConflictDoNothing();
      return link;
    });
  }

  createWithPendingZarinpal(
    input: CreatePaymentLinkRequest,
    options: { checkoutUrl: string; providerRef: string },
    pending: {
      authority: string;
      amountMinor: string;
      returnUrl?: string;
    },
  ): Promise<PaymentLinkSummary> {
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const link = await this.insertPaymentLink(tx, "zarinpal", input, options);
      const authority = pending.authority.trim();
      if (!authority) throw new Error("ZARINPAL_AUTHORITY");
      await tx
        .insert(pendingZarinpalPayment)
        .values({
          authority,
          amountMinor: BigInt(pending.amountMinor),
          workspaceId: input.workspaceId,
          paymentLinkId: link.id,
          returnUrl: pending.returnUrl?.trim() || null,
          status: "pending",
        })
        .onConflictDoNothing();
      return link;
    });
  }

  private async insertPaymentLink(
    tx: AppDatabase,
    provider: PaymentProviderId,
    input: CreatePaymentLinkRequest,
    options?: { checkoutUrl?: string; providerRef?: string },
  ): Promise<PaymentLinkSummary> {
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
    returnUrl?: string;
  }): Promise<void> {
    const authority = input.authority.trim();
    if (!authority) throw new Error("ZARINPAL_AUTHORITY");
    await withTenantContext(
      this.db,
      { workspaceId: input.workspaceId },
      async (tx) => {
        await tx
          .insert(pendingZarinpalPayment)
          .values({
            authority,
            amountMinor: BigInt(input.amountMinor),
            workspaceId: input.workspaceId,
            paymentLinkId: input.paymentLinkId ?? null,
            returnUrl: input.returnUrl?.trim() || null,
            status: "pending",
          })
          .onConflictDoNothing();
      },
    );
  }

  findPendingZarinpal(authority: string): Promise<PendingZarinpalPayment | null> {
    const key = authority.trim();
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.zarinpal_authority', ${key}, true)`,
      );
      const rows = await tx
        .select()
        .from(pendingZarinpalPayment)
        .where(eq(pendingZarinpalPayment.authority, key))
        .limit(1);
      return rows[0] ? mapPending(rows[0]) : null;
    });
  }

  async markZarinpalVerified(
    authority: string,
    refId: string,
  ): Promise<PendingZarinpalPayment> {
    const key = authority.trim();
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.zarinpal_authority', ${key}, true)`,
      );
      const existing = await tx
        .select()
        .from(pendingZarinpalPayment)
        .where(eq(pendingZarinpalPayment.authority, key))
        .limit(1);
      const current = existing[0];
      if (!current) throw new Error("ZARINPAL_UNKNOWN_AUTHORITY");
      if (current.status === "verified") return mapPending(current);

      const updated = await tx
        .update(pendingZarinpalPayment)
        .set({
          status: "verified",
          refId,
          verifiedAt: new Date(),
        })
        .where(eq(pendingZarinpalPayment.authority, key))
        .returning();
      const row = updated[0];
      if (!row) throw new Error("ZARINPAL_UNKNOWN_AUTHORITY");
      return mapPending(row);
    });
  }

  async savePendingLocalPsp(input: {
    intentId: string;
    amountMinor: string;
    currency?: string;
    description: string;
    returnUrl: string;
    workspaceId: string;
    paymentLinkId?: string;
    expiresAt: string;
  }): Promise<void> {
    const intentId = input.intentId.trim();
    if (!intentId) throw new Error("LOCAL_PSP_INTENT");
    await withTenantContext(
      this.db,
      { workspaceId: input.workspaceId },
      async (tx) => {
        await tx
          .insert(pendingLocalPspPayment)
          .values({
            intentId,
            amountMinor: BigInt(input.amountMinor),
            currency: input.currency ?? "IRR",
            description: input.description.trim(),
            returnUrl: input.returnUrl.trim(),
            workspaceId: input.workspaceId,
            paymentLinkId: input.paymentLinkId ?? null,
            status: "pending",
            expiresAt: new Date(input.expiresAt),
          })
          .onConflictDoNothing();
      },
    );
  }

  findPendingLocalPsp(intentId: string): Promise<PendingLocalPspPayment | null> {
    const key = intentId.trim();
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.local_psp_intent_id', ${key}, true)`,
      );
      const rows = await tx
        .select()
        .from(pendingLocalPspPayment)
        .where(eq(pendingLocalPspPayment.intentId, key))
        .limit(1);
      return rows[0] ? mapLocalPsp(rows[0]) : null;
    });
  }

  async markLocalPspVerified(
    intentId: string,
    refId: string,
  ): Promise<PendingLocalPspPayment> {
    const key = intentId.trim();
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.local_psp_intent_id', ${key}, true)`,
      );
      const existing = await tx
        .select()
        .from(pendingLocalPspPayment)
        .where(eq(pendingLocalPspPayment.intentId, key))
        .limit(1);
      const current = existing[0];
      if (!current) throw new Error("LOCAL_PSP_UNKNOWN_INTENT");
      if (current.status === "verified") return mapLocalPsp(current);

      const updated = await tx
        .update(pendingLocalPspPayment)
        .set({
          status: "verified",
          refId,
          verifiedAt: new Date(),
        })
        .where(eq(pendingLocalPspPayment.intentId, key))
        .returning();
      const row = updated[0];
      if (!row) throw new Error("LOCAL_PSP_UNKNOWN_INTENT");
      return mapLocalPsp(row);
    });
  }

  getLink(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<PaymentLinkSummary | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(paymentLink)
        .where(
          and(eq(paymentLink.id, paymentLinkId), eq(paymentLink.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ? mapPaymentLink(rows[0]) : null;
    });
  }

  markLinkPaid(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<PaymentLinkSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const existing = await tx
        .select()
        .from(paymentLink)
        .where(
          and(eq(paymentLink.id, paymentLinkId), eq(paymentLink.workspaceId, workspaceId)),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error("PAYMENT_LINK_NOT_FOUND");
      if (row.status === "paid") return mapPaymentLink(row);

      const updated = await tx
        .update(paymentLink)
        .set({ status: "paid" })
        .where(eq(paymentLink.id, paymentLinkId))
        .returning();
      const next = updated[0];
      if (!next) throw new Error("PAYMENT_LINK_NOT_FOUND");
      return mapPaymentLink(next);
    });
  }
}
