import {
  serializeWorkspaceApprovalTiers,
  type UpdateWorkspaceExpensePolicyRequest,
  type WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import type { ExpensePolicyStore } from "./expense-policy.types.js";
import { defaultExpensePolicy } from "./expense-policy.store-map.js";

type MemPolicy = WorkspaceExpensePolicySummary & {
  approvalTiersJson?: string | null;
};

export class MemoryExpensePolicyStore implements ExpensePolicyStore {
  readonly persistence = "memory" as const;
  private readonly policies = new Map<string, MemPolicy>();

  get(workspaceId: string): Promise<WorkspaceExpensePolicySummary> {
    return Promise.resolve(this.policies.get(workspaceId) ?? defaultExpensePolicy(workspaceId));
  }

  put(
    workspaceId: string,
    actorUserId: string,
    input: UpdateWorkspaceExpensePolicyRequest,
  ): Promise<WorkspaceExpensePolicySummary> {
    const prev = this.policies.get(workspaceId);
    const approvalTiersJson =
      input.approvalTiers !== undefined
        ? serializeWorkspaceApprovalTiers(input.approvalTiers)
        : (prev?.approvalTiersJson ?? null);
    const policy: MemPolicy = {
      workspaceId,
      approvalThresholdMinor: input.approvalThresholdMinor,
      requireReceiptAboveMinor: input.requireReceiptAboveMinor,
      requireReceiptCategoryIds:
        input.requireReceiptCategoryIds ?? prev?.requireReceiptCategoryIds ?? [],
      requireCostCenter: input.requireCostCenter ?? prev?.requireCostCenter ?? false,
      approvalTiers: input.approvalTiers ?? prev?.approvalTiers ?? null,
      approvalTiersJson,
      perDiemDailyMinor:
        input.perDiemDailyMinor !== undefined
          ? input.perDiemDailyMinor
          : (prev?.perDiemDailyMinor ?? null),
      updatedAt: new Date().toISOString(),
      updatedByUserId: actorUserId,
    };
    this.policies.set(workspaceId, policy);
    return Promise.resolve(policy);
  }
}
