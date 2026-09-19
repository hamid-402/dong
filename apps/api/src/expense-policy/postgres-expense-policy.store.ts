import {
  createDatabase,
  eq,
  withTenantContext,
  workspaceExpensePolicy,
  type AppDatabase,
} from "@dang/db";
import {
  serializeWorkspaceApprovalTiers,
  type UpdateWorkspaceExpensePolicyRequest,
  type WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import type { ExpensePolicyStore } from "./expense-policy.types.js";
import {
  defaultExpensePolicy,
  mapExpensePolicyRow,
} from "./expense-policy.store-map.js";

export class PostgresExpensePolicyStore implements ExpensePolicyStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresExpensePolicyStore {
    return new PostgresExpensePolicyStore(createDatabase(url).db);
  }

  get(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceExpensePolicySummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspaceExpensePolicy)
          .where(eq(workspaceExpensePolicy.workspaceId, workspaceId))
          .limit(1);
        return rows[0]
          ? mapExpensePolicyRow(rows[0])
          : defaultExpensePolicy(workspaceId);
      },
    );
  }

  put(
    workspaceId: string,
    actorUserId: string,
    input: UpdateWorkspaceExpensePolicyRequest,
  ): Promise<WorkspaceExpensePolicySummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(workspaceExpensePolicy)
          .where(eq(workspaceExpensePolicy.workspaceId, workspaceId))
          .limit(1);
        const prev = existing[0];
        const categoryIds = input.requireReceiptCategoryIds ?? prev?.requireReceiptCategoryIds ?? [];
        const approvalTiersJson =
          input.approvalTiers !== undefined
            ? serializeWorkspaceApprovalTiers(input.approvalTiers)
            : (prev?.approvalTiersJson ?? null);
        const rows = await tx
          .insert(workspaceExpensePolicy)
          .values({
            workspaceId,
            approvalThresholdMinor:
              input.approvalThresholdMinor == null
                ? null
                : BigInt(input.approvalThresholdMinor),
            requireReceiptAboveMinor:
              input.requireReceiptAboveMinor == null
                ? null
                : BigInt(input.requireReceiptAboveMinor),
            requireReceiptCategoryIds: categoryIds,
            requireCostCenter: input.requireCostCenter ?? prev?.requireCostCenter ?? false,
            approvalTiersJson,
            perDiemDailyMinor:
              input.perDiemDailyMinor === undefined
                ? (prev?.perDiemDailyMinor ?? null)
                : input.perDiemDailyMinor == null
                  ? null
                  : BigInt(input.perDiemDailyMinor),
            updatedByUserId: actorUserId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: workspaceExpensePolicy.workspaceId,
            set: {
              approvalThresholdMinor:
                input.approvalThresholdMinor == null
                  ? null
                  : BigInt(input.approvalThresholdMinor),
              requireReceiptAboveMinor:
                input.requireReceiptAboveMinor == null
                  ? null
                  : BigInt(input.requireReceiptAboveMinor),
              requireReceiptCategoryIds: categoryIds,
              requireCostCenter: input.requireCostCenter ?? prev?.requireCostCenter ?? false,
              approvalTiersJson,
              perDiemDailyMinor:
                input.perDiemDailyMinor === undefined
                  ? prev?.perDiemDailyMinor
                  : input.perDiemDailyMinor == null
                    ? null
                    : BigInt(input.perDiemDailyMinor),
              updatedByUserId: actorUserId,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!rows[0]) throw new Error("EXPENSE_POLICY_UPDATE_FAILED");
        return mapExpensePolicyRow(rows[0]);
      },
    );
  }
}
