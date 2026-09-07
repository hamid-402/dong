import {
  createDatabase,
  eq,
  withTenantContext,
  workspaceExpensePolicy,
  type AppDatabase,
} from "@dang/db";
import type {
  UpdateWorkspaceExpensePolicyRequest,
  WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import type { ExpensePolicyStore } from "./expense-policy.types.js";

function mapRow(
  row: typeof workspaceExpensePolicy.$inferSelect,
): WorkspaceExpensePolicySummary {
  return {
    workspaceId: row.workspaceId,
    approvalThresholdMinor: row.approvalThresholdMinor?.toString() ?? null,
    requireReceiptAboveMinor: row.requireReceiptAboveMinor?.toString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
  };
}

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
          ? mapRow(rows[0])
          : {
              workspaceId,
              approvalThresholdMinor: null,
              requireReceiptAboveMinor: null,
            };
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
              updatedByUserId: actorUserId,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!rows[0]) throw new Error("EXPENSE_POLICY_UPDATE_FAILED");
        return mapRow(rows[0]);
      },
    );
  }
}
