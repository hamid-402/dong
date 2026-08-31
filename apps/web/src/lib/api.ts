import type {
  AgreementSummary,
  AssetSummary,
  AttachmentSummary,
  AuthMeResponse,
  BudgetSummary,
  CommentSummary,
  ContributionSummary,
  CreateAgreementRequest,
  CreateAssetFromDeliveryRequest,
  CreateAttachmentRequest,
  CreateBudgetRequest,
  CreateCommentRequest,
  CreateExpenseDraftRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateNeedRequest,
  CreatePaymentLinkRequest,
  CreatePeriodLockRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CreateSettlementClaimRequest,
  CreateVendorRequest,
  CreateWorkspaceRequest,
  DeliverySummary,
  ExpenseSummary,
  MemberAccountReport,
  MembershipSummary,
  JournalEntrySummary,
  NeedSummary,
  NotificationSummary,
  OwnershipShareSummary,
  PartnerLoanSummary,
  PaymentLinkSummary,
  PeriodLockSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordContributionRequest,
  RecordDeliveryRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
  ReportExportPayload,
  SessionSummary,
  SettlementSummary,
  SubmitApprovalRequest,
  VendorSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
  WorkspaceTemplateCatalogItem,
} from "@dang/contracts";

export type AuditEventDto = {
  id: string;
  workspaceId: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: "success" | "failure" | "denied";
  reason?: string;
  requestId?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3006/api/v1";

const DEV_SUBJECT_KEY = "dang.dev.subject";
const DEV_NAME_KEY = "dang.dev.displayName";

/** Fetch Headers reject non-ISO-8859-1; encode Unicode for transport. */
export function encodeDevHeader(value: string): string {
  return `b64:${btoa(unescape(encodeURIComponent(value)))}`;
}

export function getDevIdentity() {
  if (typeof window === "undefined") {
    return { subject: "dev-local-user", displayName: "کاربر محلی" };
  }
  return {
    subject: window.localStorage.getItem(DEV_SUBJECT_KEY) ?? "dev-local-user",
    displayName: window.localStorage.getItem(DEV_NAME_KEY) ?? "کاربر محلی",
  };
}

/** Stable defaults for useState initializers (avoid SSR/localStorage mismatch). */
export const DEV_IDENTITY_DEFAULTS: { subject: string; displayName: string } = {
  subject: "dev-local-user",
  displayName: "کاربر محلی",
};

export function setDevIdentity(subject: string, displayName: string) {
  window.localStorage.setItem(DEV_SUBJECT_KEY, subject);
  window.localStorage.setItem(DEV_NAME_KEY, displayName);
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const identity = getDevIdentity();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("x-dang-subject", encodeDevHeader(identity.subject));
  headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }
  if (idempotencyKey) {
    headers.set("idempotency-key", idempotencyKey);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => apiFetch<AuthMeResponse>("/auth/me"),
  session: () => apiFetch<SessionSummary>("/auth/session"),
  templates: () => apiFetch<WorkspaceTemplateCatalogItem[]>("/workspaces/templates"),
  listWorkspaces: () => apiFetch<WorkspaceSummary[]>("/workspaces"),
  createWorkspace: (body: CreateWorkspaceRequest, idempotencyKey?: string) =>
    apiFetch<WorkspaceSummary>(
      "/workspaces",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey,
    ),
  listMembers: (workspaceId: string) =>
    apiFetch<MembershipSummary[]>(`/workspaces/${workspaceId}/members`),
  createInvite: (workspaceId: string, body: CreateInviteRequest, idempotencyKey?: string) =>
    apiFetch<CreateInviteResponse>(
      `/workspaces/${workspaceId}/invites`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey,
    ),
  acceptInvite: (token: string) =>
    apiFetch<WorkspaceSummary>("/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  listExpenses: (workspaceId: string) =>
    apiFetch<ExpenseSummary[]>(`/workspaces/${workspaceId}/expenses`),
  createExpenseDraft: (workspaceId: string, body: CreateExpenseDraftRequest) =>
    apiFetch<ExpenseSummary>(
      `/workspaces/${workspaceId}/expenses`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      body.idempotencyKey,
    ),
  submitExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(`/workspaces/${workspaceId}/expenses/${expenseId}/submit`, {
      method: "POST",
    }),
  postExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(`/workspaces/${workspaceId}/expenses/${expenseId}/post`, {
      method: "POST",
    }),
  listSettlements: (workspaceId: string) =>
    apiFetch<SettlementSummary[]>(`/workspaces/${workspaceId}/settlements`),
  createSettlementClaim: (workspaceId: string, body: CreateSettlementClaimRequest) =>
    apiFetch<SettlementSummary>(
      `/workspaces/${workspaceId}/settlements`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      body.idempotencyKey,
    ),
  confirmSettlement: (workspaceId: string, settlementId: string) =>
    apiFetch<SettlementSummary>(
      `/workspaces/${workspaceId}/settlements/${settlementId}/confirm`,
      { method: "POST" },
    ),
  disputeSettlement: (workspaceId: string, settlementId: string) =>
    apiFetch<SettlementSummary>(
      `/workspaces/${workspaceId}/settlements/${settlementId}/dispute`,
      { method: "POST" },
    ),
  cancelSettlement: (workspaceId: string, settlementId: string) =>
    apiFetch<SettlementSummary>(
      `/workspaces/${workspaceId}/settlements/${settlementId}/cancel`,
      { method: "POST" },
    ),
  getBalances: (workspaceId: string) =>
    apiFetch<WorkspaceBalancesResponse>(`/workspaces/${workspaceId}/balances`),
  listLedgerEntries: (workspaceId: string) =>
    apiFetch<JournalEntrySummary[]>(`/workspaces/${workspaceId}/ledger/entries`),
  listAuditEvents: (workspaceId: string) =>
    apiFetch<AuditEventDto[]>(`/workspaces/${workspaceId}/audit-events`),
  createComment: (workspaceId: string, body: CreateCommentRequest) =>
    apiFetch<CommentSummary>(`/workspaces/${workspaceId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createAttachment: (workspaceId: string, body: CreateAttachmentRequest) =>
    apiFetch<AttachmentSummary>(
      `/workspaces/${workspaceId}/attachments`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listNotifications: (workspaceId: string) =>
    apiFetch<NotificationSummary[]>(`/workspaces/${workspaceId}/notifications`),
  createNeed: (workspaceId: string, body: CreateNeedRequest) =>
    apiFetch<NeedSummary>(
      `/workspaces/${workspaceId}/needs`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listNeeds: (workspaceId: string) =>
    apiFetch<NeedSummary[]>(`/workspaces/${workspaceId}/needs`),
  createPurchaseRequest: (workspaceId: string, body: CreatePurchaseRequestRequest) =>
    apiFetch<PurchaseRequestSummary>(
      `/workspaces/${workspaceId}/purchase-requests`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  submitPurchaseRequest: (workspaceId: string, requestId: string) =>
    apiFetch<PurchaseRequestSummary>(
      `/workspaces/${workspaceId}/purchase-requests/${requestId}/submit`,
      { method: "POST" },
    ),
  listPurchaseRequests: (workspaceId: string) =>
    apiFetch<PurchaseRequestSummary[]>(`/workspaces/${workspaceId}/purchase-requests`),
  approvePurchaseRequest: (workspaceId: string, body: SubmitApprovalRequest) =>
    apiFetch<PurchaseRequestSummary>(`/workspaces/${workspaceId}/approvals`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createBudget: (workspaceId: string, body: CreateBudgetRequest) =>
    apiFetch<BudgetSummary>(
      `/workspaces/${workspaceId}/budgets`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listBudgets: (workspaceId: string) =>
    apiFetch<BudgetSummary[]>(`/workspaces/${workspaceId}/budgets`),
  createVendor: (workspaceId: string, body: CreateVendorRequest) =>
    apiFetch<VendorSummary>(
      `/workspaces/${workspaceId}/vendors`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listVendors: (workspaceId: string) =>
    apiFetch<VendorSummary[]>(`/workspaces/${workspaceId}/vendors`),
  createPurchaseOrder: (workspaceId: string, body: CreatePurchaseOrderRequest) =>
    apiFetch<PurchaseOrderSummary>(
      `/workspaces/${workspaceId}/purchase-orders`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPurchaseOrders: (workspaceId: string) =>
    apiFetch<PurchaseOrderSummary[]>(`/workspaces/${workspaceId}/purchase-orders`),
  recordDelivery: (workspaceId: string, body: RecordDeliveryRequest) =>
    apiFetch<DeliverySummary>(
      `/workspaces/${workspaceId}/deliveries`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listDeliveries: (workspaceId: string) =>
    apiFetch<DeliverySummary[]>(`/workspaces/${workspaceId}/deliveries`),
  createAssetFromDelivery: (workspaceId: string, body: CreateAssetFromDeliveryRequest) =>
    apiFetch<AssetSummary>(
      `/workspaces/${workspaceId}/assets/from-delivery`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listAssets: (workspaceId: string) =>
    apiFetch<AssetSummary[]>(`/workspaces/${workspaceId}/assets`),
  createAgreement: (workspaceId: string, body: CreateAgreementRequest) =>
    apiFetch<AgreementSummary>(
      `/workspaces/${workspaceId}/agreements`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listAgreements: (workspaceId: string) =>
    apiFetch<AgreementSummary[]>(`/workspaces/${workspaceId}/agreements`),
  recordContribution: (workspaceId: string, body: RecordContributionRequest) =>
    apiFetch<ContributionSummary>(
      `/workspaces/${workspaceId}/contributions`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  recordPartnerLoan: (workspaceId: string, body: RecordPartnerLoanRequest) =>
    apiFetch<PartnerLoanSummary>(
      `/workspaces/${workspaceId}/partner-loans`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  recordWithdrawal: (workspaceId: string, body: RecordWithdrawalRequest) =>
    apiFetch<unknown>(
      `/workspaces/${workspaceId}/withdrawals`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  ownershipShares: (workspaceId: string, agreementId: string) =>
    apiFetch<OwnershipShareSummary[]>(
      `/workspaces/${workspaceId}/agreements/${agreementId}/ownership-shares`,
    ),
  memberReport: (workspaceId: string, memberUserId: string) =>
    apiFetch<MemberAccountReport>(
      `/workspaces/${workspaceId}/reports/members/${memberUserId}`,
    ),
  exportMemberReport: (workspaceId: string, memberUserId: string) =>
    apiFetch<ReportExportPayload>(
      `/workspaces/${workspaceId}/reports/members/${memberUserId}/export`,
    ),
  createPeriodLock: (workspaceId: string, body: CreatePeriodLockRequest) =>
    apiFetch<PeriodLockSummary>(
      `/workspaces/${workspaceId}/period-locks`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPeriodLocks: (workspaceId: string) =>
    apiFetch<PeriodLockSummary[]>(`/workspaces/${workspaceId}/period-locks`),
  createPaymentLink: (workspaceId: string, body: CreatePaymentLinkRequest) =>
    apiFetch<PaymentLinkSummary>(
      `/workspaces/${workspaceId}/payment-links`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPaymentLinks: (workspaceId: string) =>
    apiFetch<PaymentLinkSummary[]>(`/workspaces/${workspaceId}/payment-links`),
  capabilities: () =>
    apiFetch<{
      iamPersistence: "memory" | "postgres";
      expensePersistence: "memory" | "postgres";
      partnershipPersistence: "memory" | "postgres";
      procurementPersistence: "memory" | "postgres";
      ledgerPersistence: "memory" | "postgres";
      phase5Started: boolean;
    }>("/system/capabilities"),
  seedDemo: () =>
    apiFetch<{
      workspace: WorkspaceSummary;
      reused: boolean;
      persistence: Record<string, string>;
    }>("/demo/seed", { method: "POST", body: "{}" }),
};
