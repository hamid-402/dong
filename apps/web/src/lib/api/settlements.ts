import type {
  CreateSettlementClaimRequest,
  CreateSimplifySettlementClaimsRequest,
  CreateSimplifySettlementClaimsResponse,
  DebtSimplifySuggestionsResponse,
  JournalEntrySummary,
  SettlementSummary,
  WorkspaceBalancesResponse,
  WorkspaceProductMetricsResponse,
} from "@dang/contracts";
import { apiFetch, type AuditEventDto } from "./client";

/** Settlement, balance, ledger and audit read/write endpoints — domain slice (dong-50 #30). */
export const settlementsApi = {
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
  getDebtSimplifySuggestions: (workspaceId: string) =>
    apiFetch<DebtSimplifySuggestionsResponse>(
      `/workspaces/${workspaceId}/balances/simplify-suggestions`,
    ),
  createSimplifySettlementClaims: (
    workspaceId: string,
    body: CreateSimplifySettlementClaimsRequest,
  ) =>
    apiFetch<CreateSimplifySettlementClaimsResponse>(
      `/workspaces/${workspaceId}/settlements/simplify-claims`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
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
};
