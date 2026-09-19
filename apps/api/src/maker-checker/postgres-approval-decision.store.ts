import {
  and,
  approvalDecision as approvalDecisionTable,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  ApprovalDecisionInsert,
  ApprovalDecisionRecord,
  ApprovalDecisionStore,
} from "./approval-decision.types.js";

function toRecord(
  row: typeof approvalDecisionTable.$inferSelect,
): ApprovalDecisionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    requestType: row.requestType,
    requestId: row.requestId,
    amountMinor: row.amountMinor,
    approverUserId: row.approverUserId,
    decision: row.decision as "approved" | "rejected",
    approverRole: row.approverRole ?? null,
    createdAt: row.createdAt,
  };
}

export class PostgresApprovalDecisionStore implements ApprovalDecisionStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresApprovalDecisionStore {
    const { db } = createDatabase(url);
    return new PostgresApprovalDecisionStore(db);
  }

  async append(row: ApprovalDecisionInsert): Promise<ApprovalDecisionRecord> {
    return withTenantContext(
      this.db,
      { workspaceId: row.workspaceId, userId: row.approverUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(approvalDecisionTable)
          .where(
            and(
              eq(approvalDecisionTable.workspaceId, row.workspaceId),
              eq(approvalDecisionTable.requestType, row.requestType),
              eq(approvalDecisionTable.requestId, row.requestId),
              eq(approvalDecisionTable.approverUserId, row.approverUserId),
            ),
          )
          .limit(1);
        if (existing[0]) return toRecord(existing[0]);

        const [inserted] = await tx
          .insert(approvalDecisionTable)
          .values({
            workspaceId: row.workspaceId,
            requestType: row.requestType,
            requestId: row.requestId,
            amountMinor: row.amountMinor,
            approverUserId: row.approverUserId,
            decision: row.decision,
            approverRole: row.approverRole ?? null,
          })
          .returning();
        if (!inserted) throw new Error("APPROVAL_DECISION_INSERT_FAILED");
        return toRecord(inserted);
      },
    );
  }

  async listForRequest(
    workspaceId: string,
    requestType: string,
    requestId: string,
    actorUserId?: string,
  ): Promise<ApprovalDecisionRecord[]> {
    return withTenantContext(
      this.db,
      {
        workspaceId,
        userId: actorUserId ?? "00000000-0000-4000-8000-000000000000",
      },
      async (tx) => {
        const rows = await tx
          .select()
          .from(approvalDecisionTable)
          .where(
            and(
              eq(approvalDecisionTable.workspaceId, workspaceId),
              eq(approvalDecisionTable.requestType, requestType),
              eq(approvalDecisionTable.requestId, requestId),
            ),
          );
        return rows.map(toRecord);
      },
    );
  }
}
