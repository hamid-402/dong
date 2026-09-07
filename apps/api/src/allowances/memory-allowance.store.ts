import type {
  CreateMemberAllowanceRequest,
  MemberAllowanceSummary,
} from "@dang/contracts";
import type { AllowanceStore } from "./allowances.types.js";

export class MemoryAllowanceStore implements AllowanceStore {
  readonly persistence = "memory" as const;
  private readonly rows: MemberAllowanceSummary[] = [];
  private readonly idempotency = new Map<string, MemberAllowanceSummary>();

  list(workspaceId: string): Promise<MemberAllowanceSummary[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.workspaceId === workspaceId && row.active),
    );
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateMemberAllowanceRequest,
  ): Promise<MemberAllowanceSummary> {
    const idemKey = `${workspaceId}:${input.idempotencyKey}`;
    const replay = this.idempotency.get(idemKey);
    if (replay) return Promise.resolve(replay);
    if (
      this.rows.some(
        (row) =>
          row.workspaceId === workspaceId &&
          row.memberUserId === input.memberUserId &&
          row.periodKind === input.periodKind &&
          row.active,
      )
    ) {
      return Promise.reject(new Error("ALLOWANCE_ACTIVE_EXISTS"));
    }
    const row: MemberAllowanceSummary = {
      id: crypto.randomUUID(),
      workspaceId,
      memberUserId: input.memberUserId,
      periodKind: input.periodKind,
      limit: input.limit,
      alertPct: input.alertPct ?? 80,
      active: true,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(row);
    this.idempotency.set(idemKey, row);
    return Promise.resolve(row);
  }
}
