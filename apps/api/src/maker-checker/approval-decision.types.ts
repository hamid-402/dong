export type ApprovalDecisionRecord = {
  id: string;
  workspaceId: string;
  requestType: string;
  requestId: string;
  amountMinor: string;
  approverUserId: string;
  decision: "approved" | "rejected";
  approverRole?: string | null;
  createdAt: Date;
};

export type ApprovalDecisionInsert = {
  workspaceId: string;
  requestType: string;
  requestId: string;
  amountMinor: string;
  approverUserId: string;
  decision: "approved" | "rejected";
  approverRole?: string | null;
};

export type ApprovalDecisionStore = {
  readonly persistence: "memory" | "postgres";
  append(row: ApprovalDecisionInsert): Promise<ApprovalDecisionRecord>;
  listForRequest(
    workspaceId: string,
    requestType: string,
    requestId: string,
    actorUserId?: string,
  ): Promise<ApprovalDecisionRecord[]>;
};

export const APPROVAL_DECISION_STORE = Symbol("APPROVAL_DECISION_STORE");
