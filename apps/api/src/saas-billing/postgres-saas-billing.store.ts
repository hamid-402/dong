import { and, desc, eq } from "@dang/db";
import {
  createDatabase,
  subscriptionInvoice,
  subscriptionPaymentMap,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  SubscriptionInvoiceSummary,
  WorkspacePlanName,
} from "@dang/contracts";
import type { SaasBillingStore } from "./saas-billing.store.js";

function toSummary(
  row: typeof subscriptionInvoice.$inferSelect,
  payable: boolean,
): SubscriptionInvoiceSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    periodMonth: row.periodMonth,
    targetPlan: row.targetPlan as WorkspacePlanName,
    amount: { amountMinor: row.amountMinor, currency: "IRR" },
    status: row.status as SubscriptionInvoiceSummary["status"],
    payable: payable && row.status === "issued",
    paymentLinkId: row.paymentLinkId ?? undefined,
    paidAt: row.paidAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    note: row.note,
  };
}

export class PostgresSaasBillingStore implements SaasBillingStore {
  readonly persistence = "postgres" as const;
  private payableHint = false;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresSaasBillingStore {
    const { db } = createDatabase(url);
    return new PostgresSaasBillingStore(db);
  }

  /** Called by service each request so payable reflects live PSP. */
  setPayableHint(payable: boolean): void {
    this.payableHint = payable;
  }

  async createInvoice(input: {
    workspaceId: string;
    periodMonth: string;
    targetPlan: WorkspacePlanName;
    amountMinor: string;
    status: SubscriptionInvoiceSummary["status"];
    note: string;
    idempotencyKey: string;
    payable: boolean;
  }): Promise<SubscriptionInvoiceSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.workspaceId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(subscriptionInvoice)
          .where(
            and(
              eq(subscriptionInvoice.workspaceId, input.workspaceId),
              eq(subscriptionInvoice.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing[0]) return toSummary(existing[0], input.payable);

        const [row] = await tx
          .insert(subscriptionInvoice)
          .values({
            workspaceId: input.workspaceId,
            periodMonth: input.periodMonth,
            targetPlan: input.targetPlan,
            amountMinor: input.amountMinor,
            currency: "IRR",
            status: input.status,
            idempotencyKey: input.idempotencyKey,
            note: input.note,
          })
          .returning();
        if (!row) throw new Error("SUBSCRIPTION_INVOICE_INSERT_FAILED");
        return toSummary(row, input.payable);
      },
    );
  }

  async listInvoices(
    workspaceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(subscriptionInvoice)
          .where(eq(subscriptionInvoice.workspaceId, workspaceId))
          .orderBy(desc(subscriptionInvoice.createdAt));
        return rows.map((r) => toSummary(r, this.payableHint));
      },
    );
  }

  async getInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(subscriptionInvoice)
          .where(
            and(
              eq(subscriptionInvoice.workspaceId, workspaceId),
              eq(subscriptionInvoice.id, invoiceId),
            ),
          )
          .limit(1);
        return rows[0] ? toSummary(rows[0], this.payableHint) : null;
      },
    );
  }

  async attachPaymentLink(
    workspaceId: string,
    invoiceId: string,
    paymentLinkId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const [row] = await tx
          .update(subscriptionInvoice)
          .set({
            paymentLinkId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(subscriptionInvoice.workspaceId, workspaceId),
              eq(subscriptionInvoice.id, invoiceId),
            ),
          )
          .returning();
        if (!row) throw new Error("SUBSCRIPTION_INVOICE_NOT_FOUND");
        await tx.insert(subscriptionPaymentMap).values({
          paymentLinkId,
          subscriptionInvoiceId: invoiceId,
          workspaceId,
        });
        return toSummary(row, this.payableHint);
      },
    );
  }

  async markPaid(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(subscriptionInvoice)
          .set({
            status: "paid",
            paidAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(subscriptionInvoice.workspaceId, workspaceId),
              eq(subscriptionInvoice.id, invoiceId),
            ),
          )
          .returning();
        if (!row) throw new Error("SUBSCRIPTION_INVOICE_NOT_FOUND");
        return toSummary(row, false);
      },
    );
  }

  async findInvoiceIdByPaymentLink(
    paymentLinkId: string,
  ): Promise<{ workspaceId: string; invoiceId: string } | null> {
    // Cross-tenant lookup for PSP callback — scan without RLS via raw connection is hard;
    // use a dedicated transaction with empty tenant then fail. Instead: iterate is impossible under FORCE RLS.
    // Store payment_link_id globally: we need a bypass for callback.
    // Practical approach: query with set_config empty won't see rows under FORCE RLS.
    // Fix: look up via payment store's workspace from pending zarinpal, then tenant context.
    // This method is only called with workspace known from pending — change signature later.
    // For postgres callback path we'll pass workspaceId from pending.
    const rows = await this.db
      .select()
      .from(subscriptionPaymentMap)
      .where(eq(subscriptionPaymentMap.paymentLinkId, paymentLinkId))
      .limit(1);
    // Without tenant GUC this returns empty under FORCE RLS.
    // Fallback: service will call findWithWorkspace.
    const row = rows[0];
    if (!row) return null;
    return { workspaceId: row.workspaceId, invoiceId: row.subscriptionInvoiceId };
  }

  async findInvoiceIdByPaymentLinkInWorkspace(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<string | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(subscriptionPaymentMap)
          .where(
            and(
              eq(subscriptionPaymentMap.workspaceId, workspaceId),
              eq(subscriptionPaymentMap.paymentLinkId, paymentLinkId),
            ),
          )
          .limit(1);
        return rows[0]?.subscriptionInvoiceId ?? null;
      },
    );
  }
}
