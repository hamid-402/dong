import {
  createDatabase,
  eq,
  withTenantContext,
  workspacePayoutProfile,
  type AppDatabase,
} from "@dang/db";
import type {
  PayoutInstructionsRecord,
  PayoutInstructionsStore,
} from "./payout-instructions.types.js";

export class PostgresPayoutInstructionsStore implements PayoutInstructionsStore {
  readonly persistence = "postgres" as const;

  private constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(databaseUrl: string): PostgresPayoutInstructionsStore {
    const { db } = createDatabase(databaseUrl);
    return new PostgresPayoutInstructionsStore(db);
  }

  async get(
    workspaceId: string,
    actorUserId: string,
  ): Promise<PayoutInstructionsRecord | null> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspacePayoutProfile)
        .where(eq(workspacePayoutProfile.workspaceId, workspaceId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return mapRow(row);
    });
  }

  async upsert(
    workspaceId: string,
    actorUserId: string,
    input: {
      holderName: string;
      destinationKind: "card" | "iban";
      destinationValue: string;
      bankName?: string;
    },
  ): Promise<PayoutInstructionsRecord> {
    const destinationValue =
      input.destinationKind === "iban"
        ? input.destinationValue.trim().toUpperCase()
        : input.destinationValue.trim();
    const now = new Date();
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      await tx
        .insert(workspacePayoutProfile)
        .values({
          workspaceId,
          holderName: input.holderName.trim(),
          destinationKind: input.destinationKind,
          destinationValue,
          bankName: input.bankName?.trim() || null,
          updatedByUserId: actorUserId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: workspacePayoutProfile.workspaceId,
          set: {
            holderName: input.holderName.trim(),
            destinationKind: input.destinationKind,
            destinationValue,
            bankName: input.bankName?.trim() || null,
            updatedByUserId: actorUserId,
            updatedAt: now,
          },
        });
      return {
        workspaceId,
        holderName: input.holderName.trim(),
        destinationKind: input.destinationKind,
        destinationValue,
        bankName: input.bankName?.trim() || undefined,
        updatedByUserId: actorUserId,
        updatedAt: now.toISOString(),
      };
    });
  }

  async clear(workspaceId: string, actorUserId: string): Promise<boolean> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const removed = await tx
        .delete(workspacePayoutProfile)
        .where(eq(workspacePayoutProfile.workspaceId, workspaceId))
        .returning({ workspaceId: workspacePayoutProfile.workspaceId });
      return removed.length > 0;
    });
  }
}

function mapRow(row: {
  workspaceId: string;
  holderName: string;
  destinationKind: string;
  destinationValue: string;
  bankName: string | null;
  updatedByUserId: string;
  updatedAt: Date;
}): PayoutInstructionsRecord {
  return {
    workspaceId: row.workspaceId,
    holderName: row.holderName,
    destinationKind: row.destinationKind === "iban" ? "iban" : "card",
    destinationValue: row.destinationValue,
    bankName: row.bankName ?? undefined,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
