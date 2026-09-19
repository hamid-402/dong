import {
  and,
  createDatabase,
  eq,
  withTenantContext,
  workspaceSplitPreset,
  workspaceSplitPresetLine,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateSplitPresetRequest,
  SplitPresetSummary,
} from "@dang/contracts";
import type { SplitPresetStore } from "./split-preset.store.js";

export class PostgresSplitPresetStore implements SplitPresetStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresSplitPresetStore {
    return new PostgresSplitPresetStore(createDatabase(url).db);
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateSplitPresetRequest,
  ): Promise<SplitPresetSummary> {
    const name = input.name?.trim();
    if (!name || name.length > 80) return Promise.reject(new Error("PRESET_NAME"));
    if (!input.lines?.length) return Promise.reject(new Error("PRESET_LINES"));
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(workspaceSplitPreset)
          .where(
            and(
              eq(workspaceSplitPreset.workspaceId, workspaceId),
              eq(workspaceSplitPreset.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return this.mapPreset(tx, existing[0]);

        const inserted = await tx
          .insert(workspaceSplitPreset)
          .values({
            workspaceId,
            name,
            splitMethod: input.splitMethod,
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("PRESET_INSERT_FAILED");
        await tx.insert(workspaceSplitPresetLine).values(
          input.lines.map((line) => ({
            presetId: row.id,
            userId: line.userId,
            shares: line.shares ?? null,
            percentBp: line.percentBp ?? null,
            amountMinor: line.amountMinor ? BigInt(line.amountMinor) : null,
          })),
        );
        return this.mapPreset(tx, row);
      },
    );
  }

  list(workspaceId: string): Promise<SplitPresetSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceSplitPreset)
        .where(eq(workspaceSplitPreset.workspaceId, workspaceId));
      const out: SplitPresetSummary[] = [];
      for (const row of rows) out.push(await this.mapPreset(tx, row));
      return out.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    });
  }

  get(workspaceId: string, presetId: string): Promise<SplitPresetSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceSplitPreset)
        .where(
          and(
            eq(workspaceSplitPreset.id, presetId),
            eq(workspaceSplitPreset.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) return undefined;
      return this.mapPreset(tx, rows[0]);
    });
  }

  delete(workspaceId: string, presetId: string): Promise<boolean> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const deleted = await tx
        .delete(workspaceSplitPreset)
        .where(
          and(
            eq(workspaceSplitPreset.id, presetId),
            eq(workspaceSplitPreset.workspaceId, workspaceId),
          ),
        )
        .returning({ id: workspaceSplitPreset.id });
      return deleted.length > 0;
    });
  }

  private async mapPreset(
    tx: AppDatabase,
    row: typeof workspaceSplitPreset.$inferSelect,
  ): Promise<SplitPresetSummary> {
    const lines = await tx
      .select()
      .from(workspaceSplitPresetLine)
      .where(eq(workspaceSplitPresetLine.presetId, row.id));
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      splitMethod: row.splitMethod as SplitPresetSummary["splitMethod"],
      lines: lines.map((line) => ({
        userId: line.userId,
        shares: line.shares ?? undefined,
        percentBp: line.percentBp ?? undefined,
        amountMinor: line.amountMinor?.toString(),
      })),
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
