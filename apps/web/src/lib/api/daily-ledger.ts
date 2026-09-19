import type {
  CreateDailyLedgerEntryRequest,
  CreateWorkspaceRangeLockRequest,
  DailyLedgerDayTemplateResponse,
  DailyLedgerResponse,
  PostLedgerDayRequest,
  UpdateDailyLedgerEntryRequest,
  UpsertWorkspaceDayRequest,
  UpsertWorkspaceDayResponse,
  WorkspaceDashboardResponse,
  WorkspaceRangeLockSummary,
} from "@dang/contracts";
import { API_BASE, apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

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
    postWithOfflineQueue<DailyLedgerResponse>({
      path: `/workspaces/${workspaceId}/daily-ledger/entries`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.itemName?.trim() || "ثبت ردیف دفترروزانه",
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
    postWithOfflineQueue<{ imported: number; skipped: number; ledger: DailyLedgerResponse }>({
      path: `/workspaces/${workspaceId}/daily-ledger/import`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "واردات CSV دفترروزانه",
    }),
  listDailyLedgerRangeLocks: (workspaceId: string, activeOnly = true) =>
    apiFetch<WorkspaceRangeLockSummary[]>(
      `/workspaces/${workspaceId}/daily-ledger/range-locks${activeOnly ? "?active=1" : ""}`,
    ),
  createDailyLedgerRangeLock: (
    workspaceId: string,
    body: CreateWorkspaceRangeLockRequest,
  ) =>
    postWithOfflineQueue<WorkspaceRangeLockSummary>({
      path: `/workspaces/${workspaceId}/daily-ledger/range-locks`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "قفل بازه دفترروزانه",
    }),
  unlockDailyLedgerRangeLock: (workspaceId: string, lockId: string) =>
    postWithOfflineQueue<WorkspaceRangeLockSummary>({
      path: `/workspaces/${workspaceId}/daily-ledger/range-locks/${lockId}/unlock`,
      body: "{}",
      label: "باز کردن قفل بازه",
    }),
  /** S11-07: batch shared + personal day lines. */
  postLedgerDay: (workspaceId: string, body: PostLedgerDayRequest) =>
    postWithOfflineQueue<DailyLedgerResponse>({
      path: `/workspaces/${workspaceId}/ledger/day`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت روز دفتر",
    }),
  /** S11-07: template from real frequent usage (empty if none). */
  getLedgerDayTemplate: (workspaceId: string, date: string) =>
    apiFetch<DailyLedgerDayTemplateResponse>(
      `/workspaces/${workspaceId}/ledger/day/${date}/template`,
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
