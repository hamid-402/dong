import type {
  CreateSettlementClaimRequest,
  SettlementSummary,
} from "@dang/contracts";
import {
  assertSettlementStatusTransition,
  toSettlementSummary,
  validateSettlementClaimInput,
  type SettlementStore,
  type StoredSettlement,
} from "./settlement.types.js";

export class MemorySettlementStore implements SettlementStore {
  readonly persistence = "memory" as const;
  private readonly settlements = new Map<string, StoredSettlement>();

  createClaim(
    actorUserId: string,
    input: CreateSettlementClaimRequest,
  ): Promise<StoredSettlement> {
    validateSettlementClaimInput(input);

    const id = crypto.randomUUID();
    const settlement: StoredSettlement = {
      id,
      workspaceId: input.workspaceId,
      fromUserId: input.fromUserId.trim(),
      toUserId: input.toUserId.trim(),
      amount: input.amount,
      status: "claimed",
      paymentLinkUrl: input.paymentLinkUrl?.trim() || undefined,
      createdAt: new Date().toISOString(),
      note: input.note?.trim() || undefined,
      idempotencyKey: input.idempotencyKey.trim(),
      createdByUserId: actorUserId,
    };
    this.settlements.set(id, settlement);
    return Promise.resolve(settlement);
  }

  confirm(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    void actorUserId;
    return Promise.resolve(this.transition(workspaceId, settlementId, "confirmed"));
  }

  dispute(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    void actorUserId;
    return Promise.resolve(this.transition(workspaceId, settlementId, "disputed"));
  }

  cancel(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    void actorUserId;
    return Promise.resolve(this.transition(workspaceId, settlementId, "cancelled"));
  }

  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<SettlementSummary[]> {
    void actorUserId;
    const result: SettlementSummary[] = [];
    for (const settlement of this.settlements.values()) {
      if (settlement.workspaceId !== workspaceId) continue;
      result.push(toSettlementSummary(settlement));
    }
    return Promise.resolve(result);
  }

  get(
    workspaceId: string,
    settlementId: string,
    _actorUserId: string,
  ): Promise<StoredSettlement | null> {
    void _actorUserId;
    const existing = this.settlements.get(settlementId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(existing);
  }

  private transition(
    workspaceId: string,
    settlementId: string,
    next: StoredSettlement["status"],
  ): StoredSettlement {
    const existing = this.settlements.get(settlementId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error("SETTLEMENT_NOT_FOUND");
    }
    assertSettlementStatusTransition(existing.status, next);
    const updated: StoredSettlement = { ...existing, status: next };
    this.settlements.set(settlementId, updated);
    return updated;
  }
}
