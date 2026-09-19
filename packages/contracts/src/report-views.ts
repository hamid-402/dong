export type ReportViewSummary = {
  id: string;
  name: string;
  kind: "personal" | "group" | "building" | "org";
  months: 3 | 6 | 12;
  sortKey: "spend" | "net" | "settlements" | "name" | "share";
  createdAt: string;
  updatedAt: string;
};

export type CreateReportViewRequest = {
  name: string;
  kind: ReportViewSummary["kind"];
  months: 3 | 6 | 12;
  sortKey: ReportViewSummary["sortKey"];
};

export const REPORT_VIEWS_PROVIDER = "report_views_v1" as const;
