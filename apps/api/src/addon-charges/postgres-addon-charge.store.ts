import {
  and,
  createDatabase,
  eq,
  personalAddonCharge,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreatePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import type {
  AddonChargeStore,
  AddonChargeTransition,
} from "./addon-charges.types.js";

function mapCharge(
  row: typeof personalAddonCharge.$inferSelect,
): PersonalAddonChargeSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    targetMemberUserId: row.targetMemberUserId,
    createdByUserId: row.createdByUserId,
    amount: {
      amountMinor: row.amountMinor.toString(),
      currency: "IRR",
    },
    title: row.title,
    note: row.note ?? undefined,
    categoryId: row.categoryId ?? undefined,
    linkedExpenseId: row.linkedExpenseId ?? undefined,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresAddonChargeStore implements AddonChargeStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(
    connectionString: string,
  ): PostgresAddonChargeStore {
    const { db } = createDatabase(connectionString);
    return new PostgresAddonChargeStore(db);
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreatePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const idempotencyKey = input.idempotencyKey.trim();
        const existing = await tx
          .select()
          .from(personalAddonCharge)
          .where(
            and(
              eq(personalAddonCharge.workspaceId, workspaceId),
              eq(personalAddonCharge.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing[0]) return mapCharge(existing[0]);

        const inserted = await tx
          .insert(personalAddonCharge)
          .values({
            workspaceId,
            targetMemberUserId: input.targetMemberUserId,
            createdByUserId: actorUserId,
            amountMinor: BigInt(input.amount.amountMinor),
            currency: input.amount.currency,
            title: input.title.trim(),
            note: input.note?.trim() || null,
            categoryId: input.categoryId,
            linkedExpenseId: input.linkedExpenseId,
            status: "pending_ack",
            idempotencyKey,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("ADDON_CHARGE_INSERT_FAILED");
        return mapCharge(row);
      },
    );
  }

  async list(
    workspaceId: string,
    actorUserId: string,
  ): Promise<PersonalAddonChargeSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(personalAddonCharge)
          .where(eq(personalAddonCharge.workspaceId, workspaceId));
        return rows
          .map(mapCharge)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
    );
  }

  async get(
    workspaceId: string,
    chargeId: string,
    actorUserId: string,
  ): Promise<PersonalAddonChargeSummary | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(personalAddonCharge)
          .where(
            and(
              eq(personalAddonCharge.workspaceId, workspaceId),
              eq(personalAddonCharge.id, chargeId),
            ),
          )
          .limit(1);
        return rows[0] ? mapCharge(rows[0]) : null;
      },
    );
  }

  async transition(
    workspaceId: string,
    chargeId: string,
    actorUserId: string,
    next: AddonChargeTransition,
    note?: string,
  ): Promise<PersonalAddonChargeSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const currentRows = await tx
          .select()
          .from(personalAddonCharge)
          .where(
            and(
              eq(personalAddonCharge.workspaceId, workspaceId),
              eq(personalAddonCharge.id, chargeId),
            ),
          )
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new Error("ADDON_CHARGE_NOT_FOUND");
        if (current.status !== "pending_ack") {
          throw new Error("ADDON_CHARGE_STATUS");
        }

        const updated = await tx
          .update(personalAddonCharge)
          .set({
            status: next,
            note:
              next === "disputed" && note !== undefined
                ? note.trim() || null
                : current.note,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(personalAddonCharge.workspaceId, workspaceId),
              eq(personalAddonCharge.id, chargeId),
              eq(personalAddonCharge.status, "pending_ack"),
            ),
          )
          .returning();
        const row = updated[0];
        if (!row) throw new Error("ADDON_CHARGE_STATUS");
        return mapCharge(row);
      },
    );
  }
}
