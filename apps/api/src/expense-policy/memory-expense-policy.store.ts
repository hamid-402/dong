import type {
  UpdateWorkspaceExpensePolicyRequest,
  WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import type { ExpensePolicyStore } from "./expense-policy.types.js";

export class MemoryExpensePolicyStore implements ExpensePolicyStore {
  readonly persistence = "memory" as const;
  private readonly policies = new Map<string, WorkspaceExpensePolicySummary>();

  get(workspaceId: string): Promise<WorkspaceExpensePolicySummary> {
    return Promise.resolve(
      this.policies.get(workspaceId) ?? {
        workspaceId,
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      },
    );
  }

  put(
    workspaceId: string,
    actorUserId: string,
    input: UpdateWorkspaceExpensePolicyRequest,
  ): Promise<WorkspaceExpensePolicySummary> {
    const policy: WorkspaceExpensePolicySummary = {
      workspaceId,
      ...input,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actorUserId,
    };
    this.policies.set(workspaceId, policy);
    return Promise.resolve(policy);
  }
}
