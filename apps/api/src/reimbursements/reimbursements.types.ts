import type { CreateReimbursementRequest, ReimbursementStatus, ReimbursementSummary } from "@dang/contracts";

export const REIMBURSEMENT_STORE = Symbol("REIMBURSEMENT_STORE");
export type ReimbursementStore = {
  readonly persistence: "memory" | "postgres";
  create(workspaceId: string, claimantUserId: string, input: CreateReimbursementRequest): Promise<ReimbursementSummary>;
  list(workspaceId: string, actorUserId: string): Promise<ReimbursementSummary[]>;
  get(workspaceId: string, id: string, actorUserId: string): Promise<ReimbursementSummary | null>;
  transition(
    workspaceId: string, id: string, actorUserId: string,
    from: readonly ReimbursementStatus[], to: ReimbursementStatus, note?: string,
  ): Promise<ReimbursementSummary>;
};
