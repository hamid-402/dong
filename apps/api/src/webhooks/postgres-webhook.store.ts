import { and, eq } from "@dang/db";
import {
  createDatabase,
  withTenantContext,
  workspaceWebhook,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateWorkspaceWebhookRequest,
  WorkspaceWebhookSummary,
} from "@dang/contracts";
import type { WorkspaceWebhookRecord, WorkspaceWebhookStore } from "./webhook.store.js";

function toSummary(row: typeof workspaceWebhook.$inferSelect): WorkspaceWebhookSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    events: [...(row.events ?? [])],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    hasSecret: Boolean(row.secret),
  };
}

function toRecord(row: typeof workspaceWebhook.$inferSelect): WorkspaceWebhookRecord {
  return {
    ...toSummary(row),
    secret: row.secret,
  };
}

export class PostgresWorkspaceWebhookStore implements WorkspaceWebhookStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresWorkspaceWebhookStore {
    const { db } = createDatabase(url);
    return new PostgresWorkspaceWebhookStore(db);
  }

  async create(
    actorUserId: string,
    input: CreateWorkspaceWebhookRequest,
  ): Promise<WorkspaceWebhookRecord> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(workspaceWebhook)
          .where(
            and(
              eq(workspaceWebhook.workspaceId, input.workspaceId),
              eq(workspaceWebhook.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing[0]) return toRecord(existing[0]);

        const inserted = await tx
          .insert(workspaceWebhook)
          .values({
            workspaceId: input.workspaceId,
            url: input.url,
            events: [...input.events],
            secret: input.secret,
            active: true,
            idempotencyKey: input.idempotencyKey,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("WEBHOOK_INSERT_FAILED");
        return toRecord(row);
      },
    );
  }

  async list(workspaceId: string): Promise<WorkspaceWebhookSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspaceWebhook)
          .where(eq(workspaceWebhook.workspaceId, workspaceId));
        return rows.map(toSummary);
      },
    );
  }

  async getActiveForEvent(
    workspaceId: string,
    eventType: string,
  ): Promise<WorkspaceWebhookRecord[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspaceWebhook)
          .where(
            and(
              eq(workspaceWebhook.workspaceId, workspaceId),
              eq(workspaceWebhook.active, true),
            ),
          );
        return rows
          .filter((r) => (r.events ?? []).includes(eventType))
          .map(toRecord);
      },
    );
  }

  async deactivate(
    workspaceId: string,
    webhookId: string,
  ): Promise<WorkspaceWebhookSummary | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const updated = await tx
          .update(workspaceWebhook)
          .set({ active: false, updatedAt: new Date() })
          .where(
            and(
              eq(workspaceWebhook.id, webhookId),
              eq(workspaceWebhook.workspaceId, workspaceId),
            ),
          )
          .returning();
        return updated[0] ? toSummary(updated[0]) : null;
      },
    );
  }
}
