import type {
  CreateReportViewRequest,
  ReportViewSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Saved kind-report presets (G07 #42). */
export const reportViewsApi = {
  listReportViews: () => apiFetch<ReportViewSummary[]>("/me/report-views"),
  createReportView: (body: CreateReportViewRequest) =>
    apiFetch<ReportViewSummary>("/me/report-views", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteReportView: (id: string) =>
    apiFetch<{ deleted: true }>(`/me/report-views/${id}`, {
      method: "DELETE",
    }),
};
