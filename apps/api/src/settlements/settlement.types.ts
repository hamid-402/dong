import type {
  CreateSettlementClaimRequest,
  Money,
  SettlementStatus,
  SettlementSummary,
} from "@dang/contracts";

export type StoredSettlement = SettlementSummary & {
  note?: string;
  idempotencyKey: string;
  createdByUserId: string;
};

export type SettlementStore = {
  readonly persistence: "memory" | "postgres";
  createClaim(
    actorUserId: string,
    input: CreateSettlementClaimRequest,
  ): Promise<StoredSettlement>;
  confirm(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement>;
  dispute(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement>;
  cancel(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement>;
  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<SettlementSummary[]>;
};

export const SETTLEMENT_STORE = Symbol("SETTLEMENT_STORE");

export function assertSettlementMoney(amount: Money): void {
  if (amount.currency !== "IRR") {
    throw new Error("SETTLEMENT_CURRENCY");
  }
  if (!/^-?\d+$/.test(amount.amountMinor)) {
    throw new Error("SETTLEMENT_AMOUNT");
  }
  if (BigInt(amount.amountMinor) <= 0n) {
    throw new Error("SETTLEMENT_AMOUNT");
  }
}

export function validateSettlementClaimInput(
  input: CreateSettlementClaimRequest,
): void {
  assertSettlementMoney(input.amount);
  if (!input.fromUserId?.trim() || !input.toUserId?.trim()) {
    throw new Error("SETTLEMENT_PARTIES");
  }
  if (input.fromUserId === input.toUserId) {
    throw new Error("SETTLEMENT_SAME_PARTY");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error("SETTLEMENT_IDEMPOTENCY");
  }
  if (input.paymentLinkUrl) {
    try {
      const url = new URL(input.paymentLinkUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("SETTLEMENT_LINK");
      }
    } catch {
      throw new Error("SETTLEMENT_LINK");
    }
  }
}

export function toSettlementSummary(settlement: StoredSettlement): SettlementSummary {
  return {
    id: settlement.id,
    workspaceId: settlement.workspaceId,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    amount: settlement.amount,
    status: settlement.status,
    paymentLinkUrl: settlement.paymentLinkUrl,
    createdAt: settlement.createdAt,
  };
}

export function assertSettlementStatusTransition(
  current: SettlementStatus,
  next: SettlementStatus,
): void {
  const allowed: Record<SettlementStatus, SettlementStatus[]> = {
    claimed: ["confirmed", "disputed", "cancelled"],
    confirmed: [],
    disputed: ["cancelled"],
    cancelled: [],
  };
  if (!allowed[current].includes(next)) {
    throw new Error("SETTLEMENT_STATUS");
  }
}
