import { and, eq, isNull, asc, sql, or, lte } from "@dang/db";
import {
  createDatabase,
  outboxEvent,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { OutboxWriteInput } from "@dang/contracts";
import { computeOutboxRetryUpdate } from "./outbox.retry.js";
import type { OutboxRecord, OutboxRelayStats, OutboxStore } from "./outbox.types.js";

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
}

function toRecord(row: typeof outboxEvent.$inferSelect): OutboxRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType as OutboxRecord["eventType"],
    payload: row.payload ?? {},
    requestId: row.requestId ?? undefined,
    traceId: row.traceId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString(),
    attempts: row.attempts,
    lastError: row.lastError ?? undefined,
    nextAttemptAt: row.nextAttemptAt?.toISOString(),
    deadLetteredAt: row.deadLetteredAt?.toISOString(),
  };
}

function normalizeRedriveRow(
  row: Record<string, unknown>,
): typeof outboxEvent.$inferSelect {
  const createdAt = asDate(row.createdAt ?? row.created_at) ?? new Date();
  const processedAt = asDate(row.processedAt ?? row.processed_at);
  const nextAttemptAt = asDate(row.nextAttemptAt ?? row.next_attempt_at);
  const deadLetteredAt = asDate(row.deadLetteredAt ?? row.dead_lettered_at);
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId ?? row.workspace_id),
    aggregateType: String(row.aggregateType ?? row.aggregate_type),
    aggregateId: String(row.aggregateId ?? row.aggregate_id),
    eventType: String(row.eventType ?? row.event_type),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    requestId: (row.requestId ?? row.request_id ?? null) as string | null,
    traceId: (row.traceId ?? row.trace_id ?? null) as string | null,
    createdAt,
    processedAt,
    attempts: Number(row.attempts ?? 0),
    lastError: (row.lastError ?? row.last_error ?? null) as string | null,
    nextAttemptAt,
    deadLetteredAt,
  };
}

export class PostgresOutboxStore implements OutboxStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresOutboxStore {
    const { db } = createDatabase(url);
    return new PostgresOutboxStore(db);
  }

  async insert(
    input: OutboxWriteInput,
    options?: { tx?: AppDatabase },
  ): Promise<OutboxRecord> {
    const work = async (tx: AppDatabase) => {
      const [row] = await tx
        .insert(outboxEvent)
        .values({
          workspaceId: input.workspaceId,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          eventType: input.eventType,
          payload: input.payload,
          requestId: input.requestId,
          traceId: input.traceId,
        })
        .returning();
      if (!row) throw new Error("OUTBOX_INSERT_FAILED");
      return toRecord(row);
    };
    if (options?.tx) return work(options.tx);
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.workspaceId },
      work,
    );
  }

  async listPending(limit = 50): Promise<OutboxRecord[]> {
    // Without tenant GUC, FORCE RLS hides rows — use listPendingForRedrive
    // (SECURITY DEFINER) or listPendingForWorkspace / insert return value.
    void limit;
    return [];
  }

  async listPendingForRedrive(limit = 50): Promise<OutboxRecord[]> {
    const capped = Math.max(1, Math.min(limit, 200));
    try {
      const rows = await this.db.execute(sql`
        SELECT * FROM ops.outbox_list_pending_for_redrive(${capped})
      `);
      const list = (rows as unknown as {
        rows?: Array<Record<string, unknown>>;
      }).rows ?? (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []);
      return list.map((row) => toRecord(normalizeRedriveRow(row)));
    } catch {
      return [];
    }
  }

  async listPendingForWorkspace(
    workspaceId: string,
    limit = 50,
  ): Promise<OutboxRecord[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const now = new Date();
        const rows = await tx
          .select()
          .from(outboxEvent)
          .where(
            and(
              isNull(outboxEvent.processedAt),
              isNull(outboxEvent.deadLetteredAt),
              or(isNull(outboxEvent.nextAttemptAt), lte(outboxEvent.nextAttemptAt, now)),
            ),
          )
          .orderBy(asc(outboxEvent.createdAt))
          .limit(limit);
        return rows.map(toRecord);
      },
    );
  }

  async markProcessed(id: string, workspaceId: string): Promise<void> {
    await withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        await tx
          .update(outboxEvent)
          .set({ processedAt: new Date(), nextAttemptAt: null })
          .where(eq(outboxEvent.id, id));
      },
    );
  }

  async markFailed(id: string, workspaceId: string, error: string): Promise<void> {
    await withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(outboxEvent)
          .where(eq(outboxEvent.id, id))
          .limit(1);
        const update = computeOutboxRetryUpdate(existing[0]?.attempts ?? 0, error);
        await tx
          .update(outboxEvent)
          .set({
            attempts: update.attempts,
            lastError: update.lastError,
            nextAttemptAt: update.nextAttemptAt
              ? new Date(update.nextAttemptAt)
              : null,
            deadLetteredAt: update.deadLetteredAt
              ? new Date(update.deadLetteredAt)
              : null,
          })
          .where(eq(outboxEvent.id, id));
      },
    );
  }

  async getRelayStats(): Promise<OutboxRelayStats | null> {
    try {
      const rows = await this.db.execute(sql`
        SELECT pending_count, failed_pending_count, oldest_pending_age_ms
        FROM ops.outbox_relay_stats()
      `);
      const row = (rows as unknown as {
        rows?: Array<Record<string, unknown>>;
      }).rows?.[0] ?? (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>)[0] : undefined);
      if (!row) return null;
      const pendingCount = Number(row.pending_count ?? 0);
      const failedPendingCount = Number(row.failed_pending_count ?? 0);
      const ageRaw = row.oldest_pending_age_ms;
      const oldestPendingAgeMs =
        ageRaw == null || ageRaw === "" ? null : Number(ageRaw);
      return {
        pendingCount,
        failedPendingCount,
        oldestPendingAgeMs:
          oldestPendingAgeMs != null && Number.isFinite(oldestPendingAgeMs)
            ? oldestPendingAgeMs
            : null,
      };
    } catch {
      // Function missing (pre-migration) or execute shape mismatch.
      return null;
    }
  }
}
