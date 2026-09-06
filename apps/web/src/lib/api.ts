import type {
  AgreementSummary,
  AssetSummary,
  AttachmentSummary,
  BudgetSummary,
  CommentSummary,
  ContributionSummary,
  CloseExpensePeriodRequest,
  CreateAgreementRequest,
  CreateAssetFromDeliveryRequest,
  CreateAttachmentRequest,
  CreateBudgetRequest,
  CreateCommentRequest,
  CreateExpensePeriodRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateNeedRequest,
  CreateOutingRequest,
  CreatePaymentLinkRequest,
  CreatePeriodLockRequest,
  CreateProposalRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CastProposalVoteRequest,
  CreateSettlementClaimRequest,
  CreateVendorRequest,
  CreateWorkspaceRequest,
  DeliverySummary,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberAccountReport,
  MemberInvoiceSummary,
  MembershipSummary,
  JournalEntrySummary,
  NeedSummary,
  NotificationSummary,
  OutingSummary,
  OwnershipShareSummary,
  PartnerLoanSummary,
  PaymentLinkSummary,
  PeriodLockSummary,
  ProposalSettingsSummary,
  ProposalSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordContributionRequest,
  RecordDeliveryRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
  ReportExportPayload,
  SettlementSummary,
  SubmitApprovalRequest,
  UpdateProposalSettingsRequest,
  VendorSummary,
  WorkspaceBalancesResponse,
  WorkspaceReportResponse,
  WorkspaceSummary,
  WorkspaceTemplateCatalogItem,
  ExpenseCategorySummary,
  RecurringRuleSummary,
  ReportExportSummary,
  CreateExpenseCategoryRequest,
  CreateRecurringRuleRequest,
  CreateReportExportRequest,
  ReportGroupBy,
  PersonalFinanceOverviewResponse,
  PersonalFinanceTrendsResponse,
  DailyLedgerResponse,
  UpsertWorkspaceDayRequest,
  UpsertWorkspaceDayResponse,
  CreateDailyLedgerEntryRequest,
  UpdateDailyLedgerEntryRequest,
  CreateWorkspaceRangeLockRequest,
  WorkspaceRangeLockSummary,
  PersonalMoneyAccountSummary,
  PersonalMoneyTxnSummary,
  PersonalBudgetSummary,
  PersonalResourcesSummary,
  PersonalCategorySummary,
  PersonalFinanceExportSummary,
  CreatePersonalMoneyAccountRequest,
  CreatePersonalMoneyTxnRequest,
  CreatePersonalTransferRequest,
  CreatePersonalCategoryRequest,
  CreatePersonalFinanceExportRequest,
  UpdatePersonalCategoryRequest,
  UpdatePersonalMoneyAccountRequest,
  UpsertPersonalBudgetRequest,
} from "@dang/contracts";

import {
  API_BASE,
  ApiError,
  apiFetch,
  authApi,
  clearClientSession,
  DEV_IDENTITY_DEFAULTS,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
  markClientSession,
  setDevIdentity,
  type AuthClientMode,
} from "./api/client";
import { expensesApi } from "./api/expenses";

export {
  API_BASE,
  ApiError,
  clearClientSession,
  DEV_IDENTITY_DEFAULTS,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
  markClientSession,
  setDevIdentity,
  type AuthClientMode,
};


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

export type SystemCapabilities = {
  version: string;
  allowDevAuth: boolean;
  oidcConfigured: boolean;
  databaseConfigured: boolean;
  /** Present when TOTP MFA API is available. */
  mfa?: boolean;
  readiness: "ready" | "degraded";
  persistence: {
    iam: "memory" | "postgres";
    audit: "memory" | "postgres";
    ledger: "memory" | "postgres";
    expense: "memory" | "postgres";
    settlement: "memory" | "postgres";
    partnership: "memory" | "postgres";
    procurement: "memory" | "postgres";
    proposals: "memory" | "postgres";
    billing: "memory" | "postgres";
    comment: "memory" | "postgres";
    notification: "memory" | "postgres";
    attachment: "memory" | "postgres";
    payment: "memory" | "postgres";
    asset: "memory" | "postgres";
    personalFinance: "memory" | "postgres";
    workspaceDay: "memory" | "postgres";
    workspaceRangeLock: "memory" | "postgres";
    account: "memory" | "postgres";
    procurementVendorPoDelivery: "memory" | "postgres";
    attachmentBlob: "local" | "none";
  };
  stubs: {
    paymentProvider: boolean;
    ocr: boolean;
    avScan: boolean;
    backgroundWorker: boolean;
    emailDelivery: boolean;
  };
  providers?: {
    payment: "stub" | "zarinpal";
    ocr: "stub" | "configured";
    antivirus: "stub" | "configured";
    jobs: "inline_stub" | "redis_queue";
    email: "log" | "resend" | "smtp" | "none";
    attachmentBlob: "local" | "none";
  };
  integrationsReady?: {
    zarinpal: { merchantConfigured: boolean; enabled: boolean };
    clamav: { hostConfigured: boolean; enabled: boolean };
    smtp: { urlConfigured: boolean; enabled: boolean };
    ocrHttp: { urlConfigured: boolean; enabled: boolean };
    workerConsumer: { redisConfigured: boolean; heartbeatAlive: boolean };
  };
};

export type HealthReadyResponse = {
  status: "ready" | "degraded";
  version: string;
  checks: {
    iam: "memory" | "postgres";
    databaseConfigured: boolean;
    oidcConfigured: boolean;
    allowDevAuth: boolean;
  };
};

export const api = {
  ...authApi,
  ...expensesApi,
  personalFinanceOverview: (query: { from: string; to: string }) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    return apiFetch<PersonalFinanceOverviewResponse>(
      `/me/finance/overview?${params.toString()}`,
    );
  },
  personalFinanceTrends: (query: {
    from: string;
    to: string;
    groupBy?: "day" | "week" | "month";
  }) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      groupBy: query.groupBy ?? "day",
    });
    return apiFetch<PersonalFinanceTrendsResponse>(
      `/me/finance/trends?${params.toString()}`,
    );
  },
  personalResourcesSummary: (query?: { yearMonth?: string }) => {
    const params = new URLSearchParams();
    if (query?.yearMonth) params.set("yearMonth", query.yearMonth);
    const q = params.toString();
    return apiFetch<PersonalResourcesSummary>(
      `/me/finance/resources${q ? `?${q}` : ""}`,
    );
  },
  listPersonalAccounts: (includeArchived?: boolean) => {
    const q = includeArchived ? "?includeArchived=1" : "";
    return apiFetch<PersonalMoneyAccountSummary[]>(`/me/finance/accounts${q}`);
  },
  createPersonalAccount: (body: CreatePersonalMoneyAccountRequest) =>
    apiFetch<PersonalMoneyAccountSummary>(
      "/me/finance/accounts",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  updatePersonalAccount: (accountId: string, body: UpdatePersonalMoneyAccountRequest) =>
    apiFetch<PersonalMoneyAccountSummary>(`/me/finance/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listPersonalTransactions: (query?: {
    accountId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.accountId) params.set("accountId", query.accountId);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    if (query?.limit) params.set("limit", String(query.limit));
    const q = params.toString();
    return apiFetch<PersonalMoneyTxnSummary[]>(
      `/me/finance/transactions${q ? `?${q}` : ""}`,
    );
  },
  createPersonalTransaction: (body: CreatePersonalMoneyTxnRequest) =>
    apiFetch<PersonalMoneyTxnSummary>(
      "/me/finance/transactions",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  createPersonalTransfer: (body: CreatePersonalTransferRequest) =>
    apiFetch<{ out: PersonalMoneyTxnSummary; in: PersonalMoneyTxnSummary }>(
      "/me/finance/transfers",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPersonalBudgets: () => apiFetch<PersonalBudgetSummary[]>("/me/finance/budgets"),
  upsertPersonalBudget: (body: UpsertPersonalBudgetRequest) =>
    apiFetch<PersonalBudgetSummary>(
      "/me/finance/budgets",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPersonalCategories: () =>
    apiFetch<PersonalCategorySummary[]>("/me/finance/categories"),
  createPersonalCategory: (body: CreatePersonalCategoryRequest) =>
    apiFetch<PersonalCategorySummary>(
      "/me/finance/categories",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  updatePersonalCategory: (categoryId: string, body: UpdatePersonalCategoryRequest) =>
    apiFetch<PersonalCategorySummary>(`/me/finance/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePersonalCategory: (categoryId: string) =>
    apiFetch<{ ok: true }>(`/me/finance/categories/${categoryId}`, {
      method: "DELETE",
    }),
  listPersonalFinanceExports: (limit?: number) => {
    const q = limit ? `?limit=${limit}` : "";
    return apiFetch<PersonalFinanceExportSummary[]>(`/me/finance/exports${q}`);
  },
  createPersonalFinanceExport: (body: CreatePersonalFinanceExportRequest) =>
    apiFetch<PersonalFinanceExportSummary>(
      "/me/finance/exports",
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  getPersonalFinanceExport: (exportId: string) =>
    apiFetch<PersonalFinanceExportSummary>(`/me/finance/exports/${exportId}`),
  downloadPersonalFinanceExportUrl: (exportId: string) =>
    `${API_BASE.replace(/\/$/, "")}/me/finance/exports/${exportId}/file`,
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
  setMemberDefaultShares: (workspaceId: string, userId: string, defaultShares: number) =>
    apiFetch<MembershipSummary>(`/workspaces/${workspaceId}/members/${userId}/default-shares`, {
      method: "PATCH",
      body: JSON.stringify({ defaultShares }),
    }),
  listOutings: (workspaceId: string) =>
    apiFetch<OutingSummary[]>(`/workspaces/${workspaceId}/outings`),
  createOuting: (workspaceId: string, body: CreateOutingRequest) =>
    apiFetch<OutingSummary>(`/workspaces/${workspaceId}/outings`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOuting: (workspaceId: string, outingId: string) =>
    apiFetch<OutingSummary>(`/workspaces/${workspaceId}/outings/${outingId}`),
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
  dailyLedger: (
    workspaceId: string,
    query: { from?: string; to?: string; preset?: string; days?: number },
  ) => {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.preset) params.set("preset", query.preset);
    if (query.days != null) params.set("days", String(query.days));
    const q = params.toString();
    return apiFetch<DailyLedgerResponse>(
      `/workspaces/${workspaceId}/daily-ledger${q ? `?${q}` : ""}`,
    );
  },
  upsertDailyLedgerDay: (
    workspaceId: string,
    date: string,
    body: UpsertWorkspaceDayRequest,
  ) =>
    apiFetch<UpsertWorkspaceDayResponse>(`/workspaces/${workspaceId}/daily-ledger/days/${date}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  createDailyLedgerEntry: (workspaceId: string, body: CreateDailyLedgerEntryRequest) =>
    apiFetch<DailyLedgerResponse>(`/workspaces/${workspaceId}/daily-ledger/entries`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDailyLedgerEntry: (
    workspaceId: string,
    expenseId: string,
    body: UpdateDailyLedgerEntryRequest,
  ) =>
    apiFetch<DailyLedgerResponse>(
      `/workspaces/${workspaceId}/daily-ledger/entries/${expenseId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
  deleteDailyLedgerEntry: (workspaceId: string, expenseId: string) =>
    apiFetch<DailyLedgerResponse>(
      `/workspaces/${workspaceId}/daily-ledger/entries/${expenseId}`,
      { method: "DELETE" },
    ),
  importDailyLedgerCsv: (
    workspaceId: string,
    body: { csv: string; idempotencyKey?: string },
  ) =>
    apiFetch<{ imported: number; skipped: number; ledger: DailyLedgerResponse }>(
      `/workspaces/${workspaceId}/daily-ledger/import`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  listDailyLedgerRangeLocks: (workspaceId: string, activeOnly = true) =>
    apiFetch<WorkspaceRangeLockSummary[]>(
      `/workspaces/${workspaceId}/daily-ledger/range-locks${activeOnly ? "?active=1" : ""}`,
    ),
  createDailyLedgerRangeLock: (
    workspaceId: string,
    body: CreateWorkspaceRangeLockRequest,
  ) =>
    apiFetch<WorkspaceRangeLockSummary>(
      `/workspaces/${workspaceId}/daily-ledger/range-locks`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  unlockDailyLedgerRangeLock: (workspaceId: string, lockId: string) =>
    apiFetch<WorkspaceRangeLockSummary>(
      `/workspaces/${workspaceId}/daily-ledger/range-locks/${lockId}/unlock`,
      { method: "POST", body: "{}" },
    ),
  downloadDailyLedgerCsvUrl: (
    workspaceId: string,
    query: { from?: string; to?: string; preset?: string; days?: number },
  ) => {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.preset) params.set("preset", query.preset);
    if (query.days != null) params.set("days", String(query.days));
    const q = params.toString();
    return `${API_BASE.replace(/\/$/, "")}/workspaces/${workspaceId}/daily-ledger/export.csv${
      q ? `?${q}` : ""
    }`;
  },
  listPeriods: (workspaceId: string) =>
    apiFetch<ExpensePeriodSummary[]>(`/workspaces/${workspaceId}/periods`),
  createPeriod: (workspaceId: string, body: CreateExpensePeriodRequest, idempotencyKey?: string) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey ?? body.idempotencyKey,
    ),
  generatePeriodInvoices: (
    workspaceId: string,
    periodId: string,
    body: GeneratePeriodInvoicesRequest = {},
  ) =>
    apiFetch<MemberInvoiceSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices/generate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  listPeriodInvoices: (workspaceId: string, periodId: string) =>
    apiFetch<MemberInvoiceSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices`,
    ),
  approveInvoice: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/approve`,
      { method: "POST", body: "{}" },
    ),
  disputeInvoice: (workspaceId: string, invoiceId: string, note?: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/dispute`,
      {
        method: "POST",
        body: JSON.stringify({ note }),
      },
    ),
  issueInvoice: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/issue`,
      { method: "POST", body: "{}" },
    ),
  markInvoicePaid: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/paid`,
      { method: "POST", body: "{}" },
    ),
  closePeriod: (
    workspaceId: string,
    periodId: string,
    body: CloseExpensePeriodRequest = { requireAllPaid: true },
  ) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods/${periodId}/close`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  cancelPeriod: (workspaceId: string, periodId: string) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods/${periodId}/cancel`,
      { method: "POST", body: "{}" },
    ),
  workspaceReport: (
    workspaceId: string,
    query: { from: string; to: string; groupBy?: ReportGroupBy },
  ) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      ...(query.groupBy ? { groupBy: query.groupBy } : {}),
    });
    return apiFetch<WorkspaceReportResponse>(
      `/workspaces/${workspaceId}/reports?${params.toString()}`,
    );
  },
  createReportExport: (workspaceId: string, body: CreateReportExportRequest) =>
    apiFetch<ReportExportSummary>(
      `/workspaces/${workspaceId}/reports/exports`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  getReportExport: (workspaceId: string, exportId: string) =>
    apiFetch<ReportExportSummary>(
      `/workspaces/${workspaceId}/reports/exports/${exportId}`,
    ),
  downloadReportExportUrl: (workspaceId: string, exportId: string) =>
    `${API_BASE.replace(/\/$/, "")}/workspaces/${workspaceId}/reports/exports/${exportId}/file`,
  listCategories: (workspaceId: string) =>
    apiFetch<ExpenseCategorySummary[]>(`/workspaces/${workspaceId}/categories`),
  createCategory: (workspaceId: string, body: CreateExpenseCategoryRequest) =>
    apiFetch<ExpenseCategorySummary>(`/workspaces/${workspaceId}/categories`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listRecurringRules: (workspaceId: string) =>
    apiFetch<RecurringRuleSummary[]>(`/workspaces/${workspaceId}/recurring-rules`),
  createRecurringRule: (workspaceId: string, body: CreateRecurringRuleRequest) =>
    apiFetch<RecurringRuleSummary>(
      `/workspaces/${workspaceId}/recurring-rules`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  runRecurringDue: (workspaceId: string) =>
    apiFetch<{ createdExpenseIds: string[]; titles: string[] }>(
      `/workspaces/${workspaceId}/recurring-rules/run-due`,
      { method: "POST", body: "{}" },
    ),
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
  listAttachments: (
    workspaceId: string,
    targetType: CreateAttachmentRequest["targetType"],
    targetId: string,
  ) =>
    apiFetch<AttachmentSummary[]>(
      `/workspaces/${workspaceId}/attachments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
    ),
  uploadAttachmentContent: (
    workspaceId: string,
    attachmentId: string,
    body: { contentBase64: string },
  ) =>
    apiFetch<AttachmentSummary>(
      `/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  attachmentContentUrl: (workspaceId: string, attachmentId: string) =>
    `${API_BASE}/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
  fetchAttachmentContent: async (workspaceId: string, attachmentId: string) => {
    const headers = new Headers({ Accept: "*/*" });
    if (getAuthClientMode() === "dev") {
      const identity = getDevIdentity();
      headers.set("x-dang-subject", encodeDevHeader(identity.subject));
      headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
    }
    const response = await fetch(
      `${API_BASE}/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
      { headers, credentials: "include" },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new ApiError(detail || `Download ${response.status}`, response.status);
    }
    return response.blob();
  },
  listNotifications: (workspaceId: string) =>
    apiFetch<NotificationSummary[]>(`/workspaces/${workspaceId}/notifications`),
  markNotificationRead: (workspaceId: string, notificationId: string) =>
    apiFetch<NotificationSummary>(
      `/workspaces/${workspaceId}/notifications/${notificationId}/read`,
      { method: "POST", body: "{}" },
    ),
  createNeed: (workspaceId: string, body: CreateNeedRequest) =>
    apiFetch<NeedSummary>(
      `/workspaces/${workspaceId}/needs`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listNeeds: (workspaceId: string) =>
    apiFetch<NeedSummary[]>(`/workspaces/${workspaceId}/needs`),
  getProposalSettings: (workspaceId: string) =>
    apiFetch<ProposalSettingsSummary>(`/workspaces/${workspaceId}/proposal-settings`),
  updateProposalSettings: (workspaceId: string, body: UpdateProposalSettingsRequest) =>
    apiFetch<ProposalSettingsSummary>(`/workspaces/${workspaceId}/proposal-settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listProposals: (workspaceId: string) =>
    apiFetch<ProposalSummary[]>(`/workspaces/${workspaceId}/proposals`),
  createProposal: (workspaceId: string, body: CreateProposalRequest) =>
    apiFetch<ProposalSummary>(
      `/workspaces/${workspaceId}/proposals`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  castProposalVote: (
    workspaceId: string,
    proposalId: string,
    body: CastProposalVoteRequest,
  ) =>
    apiFetch<ProposalSummary>(`/workspaces/${workspaceId}/proposals/${proposalId}/votes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  withdrawProposal: (workspaceId: string, proposalId: string) =>
    apiFetch<ProposalSummary>(`/workspaces/${workspaceId}/proposals/${proposalId}/withdraw`, {
      method: "POST",
      body: "{}",
    }),
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
  capabilities: () => apiFetch<SystemCapabilities>("/system/capabilities"),
  healthReady: () => apiFetch<HealthReadyResponse>("/health/ready"),
  seedDemo: () =>
    apiFetch<{
      workspace: WorkspaceSummary;
      reused: boolean;
      persistence: Record<string, string>;
    }>("/demo/seed", { method: "POST", body: "{}" }),
};
