import type {
  CreateStatementExportRequest,
  MemberStatementDetail,
  StatementExportSummary,
  UpsertWorkspacePayoutInstructionsRequest,
  WorkspacePayoutInstructions,
  WorkspaceStatementsResponse,
} from "@dang/contracts";
import {
  API_BASE,
  ApiError,
  apiFetch,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
} from "./client";
import { postWithOfflineQueue } from "./offline-post";

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

export const statementsApi = {
  listStatements: (
    workspaceId: string,
    query: { from: string; to: string; granularity?: "day" | "period" },
  ) =>
    apiFetch<WorkspaceStatementsResponse>(
      `/workspaces/${workspaceId}/statements${qs({
        from: query.from,
        to: query.to,
        granularity: query.granularity,
      })}`,
    ),

  getMemberStatement: (
    workspaceId: string,
    userId: string,
    query: { from: string; to: string },
  ) =>
    apiFetch<MemberStatementDetail>(
      `/workspaces/${workspaceId}/statements/${userId}${qs(query)}`,
    ),

  createStatementExport: (
    workspaceId: string,
    userId: string,
    body: CreateStatementExportRequest,
  ) =>
    postWithOfflineQueue<StatementExportSummary>({
      path: `/workspaces/${workspaceId}/statements/${userId}/exports`,
      body: JSON.stringify(body),
      label: "خروجی صورت‌حساب",
    }),

  notifyStatementReady: (
    workspaceId: string,
    userId: string,
    body: { from: string; to: string },
  ) =>
    postWithOfflineQueue<{ notified: true; href: string; emailDelivered?: boolean }>({
      path: `/workspaces/${workspaceId}/statements/${userId}/notify`,
      body: JSON.stringify(body),
      label: "اعلان آماده‌بودن صورت‌حساب",
    }),

  getStatementExport: (workspaceId: string, exportId: string) =>
    apiFetch<StatementExportSummary>(
      `/workspaces/${workspaceId}/statements/exports/${exportId}`,
    ),

  downloadStatementExportUrl: (workspaceId: string, exportId: string) =>
    `${API_BASE.replace(/\/$/, "")}/workspaces/${workspaceId}/statements/exports/${exportId}/download`,

  /** Authenticated download (cookies + DevAuth headers) — preferred over window.open. */
  downloadStatementExportBlob: async (
    workspaceId: string,
    exportId: string,
    format: "csv" | "json" = "csv",
  ): Promise<{ blob: Blob; fileName: string }> => {
    const headers = new Headers({ Accept: "*/*" });
    if (getAuthClientMode() === "dev") {
      const identity = getDevIdentity();
      headers.set("x-dang-subject", encodeDevHeader(identity.subject));
      headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
    }
    const response = await fetch(
      `${API_BASE.replace(/\/$/, "")}/workspaces/${workspaceId}/statements/exports/${exportId}/download`,
      { headers, credentials: "include" },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new ApiError(detail || `Download ${response.status}`, response.status);
    }
    const blob = await response.blob();
    const fileName = filenameFromDisposition(
      response.headers.get("Content-Disposition"),
      `statement.${format}`,
    );
    return { blob, fileName };
  },

  getPayoutInstructions: (workspaceId: string) =>
    apiFetch<WorkspacePayoutInstructions | null>(
      `/workspaces/${workspaceId}/payout-instructions`,
    ),

  upsertPayoutInstructions: (
    workspaceId: string,
    body: UpsertWorkspacePayoutInstructionsRequest,
  ) =>
    apiFetch<WorkspacePayoutInstructions>(
      `/workspaces/${workspaceId}/payout-instructions`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  clearPayoutInstructions: (workspaceId: string) =>
    apiFetch<{ cleared: boolean }>(`/workspaces/${workspaceId}/payout-instructions`, {
      method: "DELETE",
    }),
};
