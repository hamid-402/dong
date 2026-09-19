import {
  parseWorkspaceApprovalTiers,
  type WorkspaceExpensePolicySummary,
} from "@dang/contracts";

export function mapExpensePolicyRow(input: {
  workspaceId: string;
  approvalThresholdMinor: bigint | null;
  requireReceiptAboveMinor: bigint | null;
  requireReceiptCategoryIds: unknown;
  requireCostCenter?: boolean | null;
  approvalTiersJson?: string | null;
  perDiemDailyMinor?: bigint | null;
  updatedAt?: Date;
  updatedByUserId?: string;
}): WorkspaceExpensePolicySummary {
  const cats = input.requireReceiptCategoryIds;
  return {
    workspaceId: input.workspaceId,
    approvalThresholdMinor: input.approvalThresholdMinor?.toString() ?? null,
    requireReceiptAboveMinor: input.requireReceiptAboveMinor?.toString() ?? null,
    requireReceiptCategoryIds: Array.isArray(cats) ? cats : [],
    requireCostCenter: Boolean(input.requireCostCenter),
    approvalTiers: parseWorkspaceApprovalTiers(input.approvalTiersJson ?? null),
    perDiemDailyMinor: input.perDiemDailyMinor?.toString() ?? null,
    updatedAt: input.updatedAt?.toISOString(),
    updatedByUserId: input.updatedByUserId,
  };
}

export function defaultExpensePolicy(workspaceId: string): WorkspaceExpensePolicySummary {
  return {
    workspaceId,
    approvalThresholdMinor: null,
    requireReceiptAboveMinor: null,
    requireReceiptCategoryIds: [],
    requireCostCenter: false,
    approvalTiers: null,
    perDiemDailyMinor: null,
  };
}
