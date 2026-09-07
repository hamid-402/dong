import {
  and,
  createDatabase,
  eq,
  settlement,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
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

function mapSettlement(row: typeof settlement.$inferSelect): StoredSettlement {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: { amountMinor: row.amountMinor.toString(), currency: "IRR" },
    status: row.status,
    paymentLinkUrl: row.paymentLinkUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
    note: row.note ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdByUserId: row.createdByUserId,
  };
}

export class PostgresSettlementStore implements SettlementStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresSettlementStore {
    const { db } = createDatabase(connectionString);
    return new PostgresSettlementStore(db);
  }

  async createClaim(
    actorUserId: string,
    input: CreateSettlementClaimRequest,
  ): Promise<StoredSettlement> {
    validateSettlementClaimInput(input);

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(settlement)
          .where(
            and(
              eq(settlement.workspaceId, input.workspaceId),
              eq(settlement.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);

        if (existing[0]) {
          return mapSettlement(existing[0]);
        }

        const inserted = await tx
          .insert(settlement)
          .values({
            workspaceId: input.workspaceId,
            fromUserId: input.fromUserId.trim(),
            toUserId: input.toUserId.trim(),
            amountMinor: BigInt(input.amount.amountMinor),
            status: "claimed",
            paymentLinkUrl: input.paymentLinkUrl?.trim() || null,
            note: input.note?.trim() || null,
            idempotencyKey: input.idempotencyKey.trim(),
            createdByUserId: actorUserId,
          })
          .returning();

        const row = inserted[0];
        if (!row) {
          throw new Error("SETTLEMENT_INSERT_FAILED");
        }
        return mapSettlement(row);
      },
    );
  }

  async confirm(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    return this.transition(workspaceId, settlementId, actorUserId, "confirmed", [
      "claimed",
    ]);
  }

  async dispute(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    return this.transition(workspaceId, settlementId, actorUserId, "disputed", [
      "claimed",
    ]);
  }

  async cancel(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement> {
    return this.transition(workspaceId, settlementId, actorUserId, "cancelled", [
      "claimed",
      "disputed",
    ]);
  }

  async listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<SettlementSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(settlement)
          .where(eq(settlement.workspaceId, workspaceId));
        return rows.map((row) => toSettlementSummary(mapSettlement(row)));
      },
    );
  }

  async get(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
  ): Promise<StoredSettlement | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(settlement)
          .where(
            and(eq(settlement.id, settlementId), eq(settlement.workspaceId, workspaceId)),
          )
          .limit(1);
        const row = rows[0];
        return row ? mapSettlement(row) : null;
      },
    );
  }

  private async transition(
    workspaceId: string,
    settlementId: string,
    actorUserId: string,
    nextStatus: StoredSettlement["status"],
    allowedFrom: StoredSettlement["status"][],
  ): Promise<StoredSettlement> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(settlement)
          .where(
            and(eq(settlement.id, settlementId), eq(settlement.workspaceId, workspaceId)),
          )
          .limit(1);

        const row = existing[0];
        if (!row) {
          throw new Error("SETTLEMENT_NOT_FOUND");
        }
        if (!allowedFrom.includes(row.status)) {
          throw new Error("SETTLEMENT_STATUS");
        }
        assertSettlementStatusTransition(row.status, nextStatus);

        const updated = await tx
          .update(settlement)
          .set({ status: nextStatus })
          .where(eq(settlement.id, settlementId))
          .returning();

        const next = updated[0];
        if (!next) {
          throw new Error("SETTLEMENT_UPDATE_FAILED");
        }
        return mapSettlement(next);
      },
    );
  }
}
