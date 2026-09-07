import type {
  CreateDailyLedgerEntryRequest,
  CreateWorkspaceRangeLockRequest,
  DailyLedgerResponse,
  UpdateDailyLedgerEntryRequest,
  UpsertWorkspaceDayRequest,
  UpsertWorkspaceDayResponse,
  WorkspaceDashboardResponse,
  WorkspaceRangeLockSummary,
} from "@dang/contracts";
import { API_BASE, apiFetch } from "./client";

/** Workspace dashboard, daily-ledger and range-lock endpoints — domain slice (dong-50 #30). */
export const dailyLedgerApi = {
  workspaceDashboard: (workspaceId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return apiFetch<WorkspaceDashboardResponse>(
      `/workspaces/${workspaceId}/dashboard${q ? `?${q}` : ""}`,
    );
  },
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
};
