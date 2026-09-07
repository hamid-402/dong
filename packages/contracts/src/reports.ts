import type { Money } from "./money.js";

export type ReportGroupBy = "day" | "week" | "month" | "year" | "category" | "visibility";

export type WorkspaceReportQuery = {
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
};

export type WorkspaceReportCompareQuery = {
  from: string;
  to: string;
  priorFrom: string;
  priorTo: string;
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

export type WorkspaceReportCompareResponse = {
  current: WorkspaceReportResponse;
  prior: WorkspaceReportResponse;
  deltaTotal: Money;
  deltaPercent: number | null;
};

export function compareReportTotals(
  current: WorkspaceReportResponse,
  prior: WorkspaceReportResponse,
): Pick<WorkspaceReportCompareResponse, "deltaTotal" | "deltaPercent"> {
  const currentMinor = BigInt(current.grandTotal.amountMinor);
  const priorMinor = BigInt(prior.grandTotal.amountMinor);
  const delta = currentMinor - priorMinor;
  return {
    deltaTotal: { amountMinor: delta.toString(), currency: "IRR" },
    deltaPercent:
      priorMinor === 0n
        ? null
        : Number(delta * 10_000n / priorMinor) / 100,
  };
}

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
  parentId?: string;
  createdAt: string;
};

export type CreateExpenseCategoryRequest = {
  name: string;
  slug?: string;
  parentId?: string;
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
  autoConfirm: boolean;
  createdByUserId: string;
  createdAt: string;
  version: number;
  effectiveFrom?: string;
  supersedesRuleId?: string;
};

export type CreateRecurringRuleRequest = {
  title: string;
  amount: Money;
  cadence: RecurringCadence;
  nextRunOn: string;
  visibility?: "shared" | "private" | "company";
  categoryId?: string;
  autoConfirm?: boolean;
  idempotencyKey: string;
};
