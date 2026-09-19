import type { CreateReportViewRequest, ReportViewSummary } from "@dang/contracts";

export type ReportViewsStore = {
  readonly persistence: "memory" | "postgres";
  list(userId: string): Promise<ReportViewSummary[]>;
  create(userId: string, input: CreateReportViewRequest): Promise<ReportViewSummary>;
  delete(userId: string, viewId: string): Promise<boolean>;
};

export const REPORT_VIEWS_STORE = Symbol("REPORT_VIEWS_STORE");
