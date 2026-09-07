import {
  costCenter,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import type { CostCenterStore } from "./cost-centers.types.js";

function mapCostCenter(
  row: typeof costCenter.$inferSelect,
): CostCenterSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    code: row.code,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresCostCenterStore implements CostCenterStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresCostCenterStore {
    return new PostgresCostCenterStore(createDatabase(url).db);
  }

  list(
    workspaceId: string,
    actorUserId: string,
  ): Promise<CostCenterSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(costCenter)
          .where(eq(costCenter.workspaceId, workspaceId));
        return rows.map(mapCostCenter).sort((a, b) => a.code.localeCompare(b.code));
      },
    );
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateCostCenterRequest,
  ): Promise<CostCenterSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        try {
          const rows = await tx
            .insert(costCenter)
            .values({
              workspaceId,
              name: input.name.trim(),
              code: input.code.trim(),
            })
            .returning();
          if (!rows[0]) throw new Error("COST_CENTER_INSERT_FAILED");
          return mapCostCenter(rows[0]);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            throw new Error("COST_CENTER_CODE_EXISTS");
          }
          throw error;
        }
      },
    );
  }
}
