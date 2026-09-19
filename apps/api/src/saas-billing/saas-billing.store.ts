import type {
  SubscriptionInvoiceSummary,
  WorkspacePlanName,
} from "@dang/contracts";

export type SaasBillingStore = {
  readonly persistence: "memory" | "postgres";
  createInvoice(input: {
    workspaceId: string;
    periodMonth: string;
    targetPlan: WorkspacePlanName;
    amountMinor: string;
    status: SubscriptionInvoiceSummary["status"];
    note: string;
    idempotencyKey: string;
    payable: boolean;
  }): Promise<SubscriptionInvoiceSummary>;
  listInvoices(
    workspaceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary[]>;
  getInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary | null>;
  attachPaymentLink(
    workspaceId: string,
    invoiceId: string,
    paymentLinkId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary>;
  markPaid(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<SubscriptionInvoiceSummary>;
  findInvoiceIdByPaymentLink(
    paymentLinkId: string,
  ): Promise<{ workspaceId: string; invoiceId: string } | null>;
  findInvoiceIdByPaymentLinkInWorkspace?(
    workspaceId: string,
    paymentLinkId: string,
  ): Promise<string | null>;
};

export const SAAS_BILLING_STORE = Symbol("SAAS_BILLING_STORE");

export class MemorySaasBillingStore implements SaasBillingStore {
  readonly persistence = "memory" as const;
  private readonly invoices = new Map<string, SubscriptionInvoiceSummary>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly paymentMap = new Map<string, { workspaceId: string; invoiceId: string }>();

  createInvoice(input: {
    workspaceId: string;
    periodMonth: string;
    targetPlan: WorkspacePlanName;
    amountMinor: string;
    status: SubscriptionInvoiceSummary["status"];
    note: string;
    idempotencyKey: string;
    payable: boolean;
  }): Promise<SubscriptionInvoiceSummary> {
    const key = `${input.workspaceId}:${input.idempotencyKey}`;
    const existingId = this.byIdempotency.get(key);
    if (existingId) {
      const existing = this.invoices.get(existingId);
      if (existing) return Promise.resolve(existing);
    }
    const now = new Date().toISOString();
    const row: SubscriptionInvoiceSummary = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      periodMonth: input.periodMonth,
      targetPlan: input.targetPlan,
      amount: { amountMinor: input.amountMinor, currency: "IRR" },
      status: input.status,
      payable: input.payable,
      createdAt: now,
      updatedAt: now,
      note: input.note,
    };
    this.invoices.set(row.id, row);
    this.byIdempotency.set(key, row.id);
    return Promise.resolve(row);
  }

  listInvoices(workspaceId: string): Promise<SubscriptionInvoiceSummary[]> {
    return Promise.resolve(
      [...this.invoices.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  getInvoice(
    workspaceId: string,
    invoiceId: string,
  ): Promise<SubscriptionInvoiceSummary | null> {
    const row = this.invoices.get(invoiceId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  attachPaymentLink(
    workspaceId: string,
    invoiceId: string,
    paymentLinkId: string,
  ): Promise<SubscriptionInvoiceSummary> {
    const row = this.invoices.get(invoiceId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("SUBSCRIPTION_INVOICE_NOT_FOUND"));
    }
    const updated: SubscriptionInvoiceSummary = {
      ...row,
      paymentLinkId,
      updatedAt: new Date().toISOString(),
    };
    this.invoices.set(invoiceId, updated);
    this.paymentMap.set(paymentLinkId, { workspaceId, invoiceId });
    return Promise.resolve(updated);
  }

  markPaid(
    workspaceId: string,
    invoiceId: string,
  ): Promise<SubscriptionInvoiceSummary> {
    const row = this.invoices.get(invoiceId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("SUBSCRIPTION_INVOICE_NOT_FOUND"));
    }
    const now = new Date().toISOString();
    const updated: SubscriptionInvoiceSummary = {
      ...row,
      status: "paid",
      paidAt: now,
      updatedAt: now,
      payable: false,
    };
    this.invoices.set(invoiceId, updated);
    return Promise.resolve(updated);
  }

  findInvoiceIdByPaymentLink(
    paymentLinkId: string,
  ): Promise<{ workspaceId: string; invoiceId: string } | null> {
    return Promise.resolve(this.paymentMap.get(paymentLinkId) ?? null);
  }
}
