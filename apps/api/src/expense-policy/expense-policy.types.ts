import type {
  UpdateWorkspaceExpensePolicyRequest,
  WorkspaceExpensePolicySummary,
} from "@dang/contracts";

export type ExpensePolicyStore = {
  readonly persistence: "memory" | "postgres";
  get(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceExpensePolicySummary>;
  put(
    workspaceId: string,
    actorUserId: string,
    input: UpdateWorkspaceExpensePolicyRequest,
  ): Promise<WorkspaceExpensePolicySummary>;
};

export const EXPENSE_POLICY_STORE = Symbol("EXPENSE_POLICY_STORE");
