import { randomUUID } from "node:crypto";
import type {
  ApprovalDecisionInsert,
  ApprovalDecisionRecord,
  ApprovalDecisionStore,
} from "./approval-decision.types.js";

export class MemoryApprovalDecisionStore implements ApprovalDecisionStore {
  readonly persistence = "memory" as const;
  private readonly rows: ApprovalDecisionRecord[] = [];

  async append(row: ApprovalDecisionInsert): Promise<ApprovalDecisionRecord> {
    const existing = this.rows.find(
      (r) =>
        r.workspaceId === row.workspaceId &&
        r.requestType === row.requestType &&
        r.requestId === row.requestId &&
        r.approverUserId === row.approverUserId,
    );
    if (existing) return existing;
    const record: ApprovalDecisionRecord = {
      id: randomUUID(),
      workspaceId: row.workspaceId,
      requestType: row.requestType,
      requestId: row.requestId,
      amountMinor: row.amountMinor,
      approverUserId: row.approverUserId,
      decision: row.decision,
      approverRole: row.approverRole ?? null,
      createdAt: new Date(),
    };
    this.rows.push(record);
    return record;
  }

  async listForRequest(
    workspaceId: string,
    requestType: string,
    requestId: string,
    _actorUserId?: string,
  ): Promise<ApprovalDecisionRecord[]> {
    return this.rows.filter(
      (r) =>
        r.workspaceId === workspaceId &&
        r.requestType === requestType &&
        r.requestId === requestId,
    );
  }
}
