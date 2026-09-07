import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  readProductFeatureFlags,
  type AuthActor,
  type UpdateWorkspaceExpensePolicyRequest,
  type WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  EXPENSE_POLICY_STORE,
  type ExpensePolicyStore,
} from "./expense-policy.types.js";

@Injectable()
export class ExpensePolicyService {
  constructor(
    @Inject(EXPENSE_POLICY_STORE) private readonly policies: ExpensePolicyStore,
    private readonly access: WorkspaceAccessService,
  ) {}

  async get(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<WorkspaceExpensePolicySummary> {
    this.assertEnabled();
    await this.access.requireMember(workspaceId, actor.userId);
    return this.policies.get(workspaceId, actor.userId);
  }

  async put(
    actor: AuthActor,
    workspaceId: string,
    input: UpdateWorkspaceExpensePolicyRequest,
  ): Promise<WorkspaceExpensePolicySummary> {
    this.assertEnabled();
    await this.access.requireFinanceManager(workspaceId, actor.userId);
    return this.policies.put(workspaceId, actor.userId, input);
  }

  private assertEnabled(): void {
    if (!readProductFeatureFlags(process.env).expensePolicy) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Expense policy is disabled",
        status: 403,
        detail: "Set ENABLE_EXPENSE_POLICY=1 to enable this feature.",
      });
    }
  }
}
