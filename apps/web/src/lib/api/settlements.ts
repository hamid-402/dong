import type {
  AnalyticsEtlRunSummary,
  AnalyticsWarehouseSnapshot,
  ConfirmSettlementRequest,
  ConfirmSimplifySettlementClaimsRequest,
  ConfirmSimplifySettlementClaimsResponse,
  CreateSettlementClaimRequest,
  CreateSimplifySettlementClaimsRequest,
  CreateSimplifySettlementClaimsResponse,
  DebtSimplifySuggestionsResponse,
  JournalEntrySummary,
  PreviewSettlementEffectRequest,
  PreviewSettlementEffectResponse,
  SettlementSummary,
  WorkspaceBalancesResponse,
  WorkspaceProductMetricsResponse,
} from "@dang/contracts";
import { apiFetch, type AuditEventDto } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Settlement, balance, ledger and audit read/write endpoints — domain slice (dong-50 #30). */
export const settlementsApi = {
  listSettlements: (workspaceId: string) =>
    apiFetch<SettlementSummary[]>(`/workspaces/${workspaceId}/settlements`),
  createSettlementClaim: (workspaceId: string, body: CreateSettlementClaimRequest) =>
    postWithOfflineQueue<SettlementSummary>({
      path: `/workspaces/${workspaceId}/settlements`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "درخواست تسویه",
    }),
  confirmSettlement: (
    workspaceId: string,
    settlementId: string,
    body: ConfirmSettlementRequest = {
      evidenceKind: "cash_ack",
      cashAckNote: "تسویه نقدی / حضوری تأیید شد",
    },
  ) =>
    postWithOfflineQueue<SettlementSummary>({
      path: `/workspaces/${workspaceId}/settlements/${settlementId}/confirm`,
      body: JSON.stringify(body),
      label: "تأیید تسویه",
    }),
  disputeSettlement: (workspaceId: string, settlementId: string) =>
    postWithOfflineQueue<SettlementSummary>({
      path: `/workspaces/${workspaceId}/settlements/${settlementId}/dispute`,
      label: "اختلاف تسویه",
    }),
  cancelSettlement: (workspaceId: string, settlementId: string) =>
    postWithOfflineQueue<SettlementSummary>({
      path: `/workspaces/${workspaceId}/settlements/${settlementId}/cancel`,
      label: "لغو تسویه",
    }),
  getBalances: (workspaceId: string) =>
    apiFetch<WorkspaceBalancesResponse>(`/workspaces/${workspaceId}/balances`),
  remindDebt: (workspaceId: string, targetUserId: string) =>
    postWithOfflineQueue<{ ok: true; skipped?: "already_today" | "not_debtor" }>({
      path: `/workspaces/${workspaceId}/balances/remind-debt`,
      body: JSON.stringify({ targetUserId }),
      label: "یادآوری بدهی",
    }),
  getDebtSimplifySuggestions: (workspaceId: string) =>
    apiFetch<DebtSimplifySuggestionsResponse>(
      `/workspaces/${workspaceId}/balances/simplify-suggestions`,
    ),
  createSimplifySettlementClaims: (
    workspaceId: string,
    body: CreateSimplifySettlementClaimsRequest,
  ) =>
    postWithOfflineQueue<CreateSimplifySettlementClaimsResponse>({
      path: `/workspaces/${workspaceId}/settlements/simplify-claims`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ادعای ساده‌سازی بدهی",
    }),
  confirmSimplifySettlementClaims: (
    workspaceId: string,
    body: ConfirmSimplifySettlementClaimsRequest,
  ) =>
    postWithOfflineQueue<ConfirmSimplifySettlementClaimsResponse>({
      path: `/workspaces/${workspaceId}/settlements/confirm-simplify-claims`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "تأیید ساده‌سازی بدهی",
    }),
  previewSettlementEffect: (
    workspaceId: string,
    body: PreviewSettlementEffectRequest,
  ) =>
    apiFetch<PreviewSettlementEffectResponse>(
      `/workspaces/${workspaceId}/settlements/preview-effect`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listLedgerEntries: (workspaceId: string) =>
    apiFetch<JournalEntrySummary[]>(`/workspaces/${workspaceId}/ledger/entries`),
  listAuditEvents: (workspaceId: string) =>
    apiFetch<AuditEventDto[]>(`/workspaces/${workspaceId}/audit-events`),
  /** Funnel counts from audit only — never invent rates (dong-50 #33). */
  workspaceProductMetrics: (workspaceId: string) =>
    apiFetch<WorkspaceProductMetricsResponse>(
      `/workspaces/${workspaceId}/product-metrics`,
    ),
  /** R10-20 — read warehouse facts only (after ETL). */
  analyticsWarehouse: (workspaceId: string) =>
    apiFetch<AnalyticsWarehouseSnapshot>(
      `/workspaces/${workspaceId}/analytics/warehouse`,
    ),
  runAnalyticsEtl: (workspaceId: string) =>
    apiFetch<AnalyticsEtlRunSummary>(
      `/workspaces/${workspaceId}/analytics/etl/run`,
      { method: "POST", body: "{}" },
    ),
};
