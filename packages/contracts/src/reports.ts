import type { Money } from "./money.js";

export type ReportGroupBy = "day" | "week" | "month" | "year" | "category" | "visibility";

export type WorkspaceReportQuery = {
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
};

export type WorkspaceReportBucket = {
  key: string;
  label: string;
  total: Money;
  count: number;
};

export type WorkspaceReportResponse = {
  workspaceId: string;
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  grandTotal: Money;
  expenseCount: number;
  buckets: WorkspaceReportBucket[];
};

export type CreateReportExportRequest = {
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
  format?: "csv";
  idempotencyKey: string;
};

export type ReportExportSummary = {
  id: string;
  workspaceId: string;
  format: "csv";
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  status: "completed" | "failed";
  rowCount: number;
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
  /** Present when completed — same bytes as download endpoint. */
  hasFile: boolean;
};

export type ExpenseCategorySummary = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type CreateExpenseCategoryRequest = {
  name: string;
  slug?: string;
};

export type RecurringCadence = "weekly" | "monthly" | "yearly";

export type RecurringRuleSummary = {
  id: string;
  workspaceId: string;
  title: string;
  amount: Money;
  cadence: RecurringCadence;
  nextRunOn: string;
  visibility: "shared" | "private" | "company";
  splitMethod: "equal";
  categoryId?: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
};

export type CreateRecurringRuleRequest = {
  title: string;
  amount: Money;
  cadence: RecurringCadence;
  nextRunOn: string;
  visibility?: "shared" | "private" | "company";
  categoryId?: string;
  idempotencyKey: string;
};
