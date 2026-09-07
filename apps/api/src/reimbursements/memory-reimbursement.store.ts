import type { CreateReimbursementRequest, ReimbursementSummary } from "@dang/contracts";
import type { ReimbursementStore } from "./reimbursements.types.js";

export class MemoryReimbursementStore implements ReimbursementStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, ReimbursementSummary & { idempotencyKey: string }>();

  async create(workspaceId: string, claimantUserId: string, input: CreateReimbursementRequest) {
    const existing = [...this.rows.values()].find(
      (row) => row.workspaceId === workspaceId && row.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(), workspaceId, expenseId: input.expenseId, claimantUserId,
      amount: { amountMinor: input.amountMinor, currency: "IRR" as const },
      title: input.title.trim(), note: input.note?.trim() || undefined,
      status: "draft" as const, createdAt: now, updatedAt: now,
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async list(workspaceId: string) {
    return [...this.rows.values()].filter((row) => row.workspaceId === workspaceId);
  }
  async get(workspaceId: string, id: string) {
    const row = this.rows.get(id);
    return row?.workspaceId === workspaceId ? row : null;
  }
  async transition(
    workspaceId: string, id: string, actorUserId: string,
    from: readonly ReimbursementSummary["status"][], to: ReimbursementSummary["status"], note?: string,
  ) {
    const row = await this.get(workspaceId, id);
    if (!row) throw new Error("REIMBURSEMENT_NOT_FOUND");
    if (!from.includes(row.status)) throw new Error("REIMBURSEMENT_STATUS");
    const now = new Date().toISOString();
    const updated = {
      ...row, status: to, note: note?.trim() || row.note, updatedAt: now,
      ...(["approved", "rejected"].includes(to) ? { decidedBy: actorUserId, decidedAt: now } : {}),
      ...(to === "paid" ? { paidAt: now } : {}),
    };
    this.rows.set(id, updated);
    return updated;
  }
}
