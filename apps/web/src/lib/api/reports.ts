import type {
  CreateReportExportRequest,
  MemberAccountReport,
  ReportExportPayload,
  ReportExportSummary,
  ReportGroupBy,
  WorkspaceReportResponse,
  WorkspaceReportCompareQuery,
  WorkspaceReportCompareResponse,
} from "@dang/contracts";
import { API_BASE, apiFetch } from "./client";

/** Workspace report, report-export and member-report endpoints — domain slice (dong-50 #30). */
export const reportsApi = {
  compareWorkspaceReport: (
    workspaceId: string,
    query: WorkspaceReportCompareQuery,
  ) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      priorFrom: query.priorFrom,
      priorTo: query.priorTo,
      ...(query.groupBy ? { groupBy: query.groupBy } : {}),
    });
    return apiFetch<WorkspaceReportCompareResponse>(
      `/workspaces/${workspaceId}/reports/compare?${params.toString()}`,
    );
  },
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
  memberReport: (workspaceId: string, memberUserId: string) =>
    apiFetch<MemberAccountReport>(
      `/workspaces/${workspaceId}/reports/members/${memberUserId}`,
    ),
  exportMemberReport: (workspaceId: string, memberUserId: string) =>
    apiFetch<ReportExportPayload>(
      `/workspaces/${workspaceId}/reports/members/${memberUserId}/export`,
    ),
};
