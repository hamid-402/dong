import {
  and,
  createDatabase,
  eq,
  memberAllowance,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateMemberAllowanceRequest,
  MemberAllowanceSummary,
} from "@dang/contracts";
import type { AllowanceStore } from "./allowances.types.js";

function mapRow(row: typeof memberAllowance.$inferSelect): MemberAllowanceSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberUserId: row.memberUserId,
    periodKind: row.periodKind as "week" | "month",
    limit: { amountMinor: row.limitMinor.toString(), currency: "IRR" },
    alertPct: row.alertPct,
    active: row.active,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresAllowanceStore implements AllowanceStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresAllowanceStore {
    return new PostgresAllowanceStore(createDatabase(url).db);
  }

  list(workspaceId: string, actorUserId: string): Promise<MemberAllowanceSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(memberAllowance)
          .where(
            and(
              eq(memberAllowance.workspaceId, workspaceId),
              eq(memberAllowance.active, true),
            ),
          );
        return rows.map(mapRow);
      },
    );
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateMemberAllowanceRequest,
  ): Promise<MemberAllowanceSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const replay = await tx
          .select()
          .from(memberAllowance)
          .where(
            and(
              eq(memberAllowance.workspaceId, workspaceId),
              eq(memberAllowance.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (replay[0]) return mapRow(replay[0]);
        try {
          const rows = await tx
            .insert(memberAllowance)
            .values({
              workspaceId,
              memberUserId: input.memberUserId,
              periodKind: input.periodKind,
              limitMinor: BigInt(input.limit.amountMinor),
              alertPct: input.alertPct ?? 80,
              idempotencyKey: input.idempotencyKey,
              createdByUserId: actorUserId,
            })
            .returning();
          if (!rows[0]) throw new Error("ALLOWANCE_INSERT_FAILED");
          return mapRow(rows[0]);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            throw new Error("ALLOWANCE_ACTIVE_EXISTS");
          }
          throw error;
        }
      },
    );
  }
}
