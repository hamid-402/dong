import type { Money } from "./money.js";

export type AgreementStatus = "draft" | "active" | "superseded" | "closed";

export type AgreementSummary = {
  id: string;
  workspaceId: string;
  title: string;
  version: number;
  status: AgreementStatus;
  effectiveFrom: string;
  createdByUserId: string;
  createdAt: string;
};

export type CreateAgreementRequest = {
  workspaceId: string;
  title: string;
  effectiveFrom: string;
  idempotencyKey: string;
};

export type ContributionKind = "cash" | "in_kind";

export type ContributionSummary = {
  id: string;
  workspaceId: string;
  agreementId: string;
  memberUserId: string;
  kind: ContributionKind;
  amount?: Money;
  description?: string;
  recordedAt: string;
};

export type RecordContributionRequest = {
  workspaceId: string;
  agreementId: string;
  memberUserId: string;
  kind: ContributionKind;
  amount?: Money;
  description?: string;
  idempotencyKey: string;
};

export type PartnerLoanStatus = "open" | "partially_repaid" | "closed";

export type PartnerLoanSummary = {
  id: string;
  workspaceId: string;
  agreementId: string;
  lenderUserId: string;
  borrowerUserId: string;
  principal: Money;
  repaidMinor: string;
  status: PartnerLoanStatus;
  recordedAt: string;
};

export type RecordPartnerLoanRequest = {
  workspaceId: string;
  agreementId: string;
  lenderUserId: string;
  borrowerUserId: string;
  principal: Money;
  idempotencyKey: string;
};

export type WithdrawalSummary = {
  id: string;
  workspaceId: string;
  agreementId: string;
  memberUserId: string;
  amount: Money;
  reason?: string;
  recordedAt: string;
};

export type RecordWithdrawalRequest = {
  workspaceId: string;
  agreementId: string;
  memberUserId: string;
  amount: Money;
  reason?: string;
  idempotencyKey: string;
};

export type OwnershipShareSummary = {
  memberUserId: string;
  displayName: string;
  sharePercent: string;
};

export type AccountReportLine = {
  category: "expense" | "contribution" | "loan" | "withdrawal";
  label: string;
  amountMinor: string;
  currency: "IRR";
};

export type MemberAccountReport = {
  workspaceId: string;
  memberUserId: string;
  displayName: string;
  lines: AccountReportLine[];
  netPositionMinor: string;
};

export type ExportFormat = "csv";

export type ReportExportPayload = {
  format: ExportFormat;
  filename: string;
  /** UTF-8 CSV content (Excel-compatible with BOM when served). */
  content: string;
  mimeType: "text/csv; charset=utf-8";
};

export type PeriodLockSummary = {
  id: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  reason?: string;
  lockedByUserId: string;
  lockedAt: string;
};

export type CreatePeriodLockRequest = {
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  reason?: string;
  idempotencyKey: string;
};

/** Escape one CSV field for Excel/LibreOffice. */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** Build Excel-openable CSV from a member account report. Categories stay separate columns. */
export function formatMemberReportCsv(report: MemberAccountReport): string {
  const header = ["category", "label", "amount_minor_irr", "currency"].join(",");
  const rows = report.lines.map((line) =>
    [
      escapeCsvField(line.category),
      escapeCsvField(line.label),
      escapeCsvField(line.amountMinor),
      escapeCsvField(line.currency),
    ].join(","),
  );
  rows.push(
    ["net", escapeCsvField(`net:${report.displayName}`), report.netPositionMinor, "IRR"].join(
      ",",
    ),
  );
  return [header, ...rows].join("\r\n");
}

export function buildMemberReportExport(report: MemberAccountReport): ReportExportPayload {
  const safeName = report.displayName.replaceAll(/[^\w\u0600-\u06FF-]+/g, "_").slice(0, 40);
  return {
    format: "csv",
    filename: `member-report-${safeName || report.memberUserId}.csv`,
    content: formatMemberReportCsv(report),
    mimeType: "text/csv; charset=utf-8",
  };
}

/** Exit criterion: expense / contribution / loan / withdrawal must not share a category bucket. */
export function assertReportCategoriesSeparated(report: MemberAccountReport): void {
  const allowed = new Set(["expense", "contribution", "loan", "withdrawal"]);
  for (const line of report.lines) {
    if (!allowed.has(line.category)) {
      throw new Error("REPORT_CATEGORY_UNKNOWN");
    }
  }
  const byCategory = new Map<string, number>();
  for (const line of report.lines) {
    byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + 1);
  }
  // Categories are labeled distinctly; mixing would mean one line using wrong category.
  for (const line of report.lines) {
    if (line.category === "contribution" && /قرض|loan/i.test(line.label) && !/آورده/.test(line.label)) {
      throw new Error("REPORT_CATEGORY_MIXED");
    }
  }
}

export const partnershipVerticalSliceSteps = [
  "create_agreement",
  "record_contribution",
  "record_loan",
  "record_withdrawal",
  "ownership_share",
  "account_report",
  "export_csv",
  "period_lock",
] as const;

export type PartnershipVerticalSliceStep = (typeof partnershipVerticalSliceSteps)[number];
