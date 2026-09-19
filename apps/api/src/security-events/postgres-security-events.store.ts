import {
  and,
  createDatabase,
  desc,
  eq,
  lt,
  or,
  securityEvent as securityEventTable,
  sql,
  type AppDatabase,
} from "@dang/db";
import {
  decodeSecurityEventCursor,
  encodeSecurityEventCursor,
  type SecurityEvent,
  type SecurityEventCategory,
  type SecurityEventListPage,
  type SecurityEventListQuery,
  type SecurityEventName,
  type SecurityEventSeverity,
} from "@dang/contracts";
import type { SecurityEventsStore } from "./security-events.types.js";

function toEvent(row: typeof securityEventTable.$inferSelect): SecurityEvent {
  const attrs = (row.attrs ?? {}) as Record<string, string | number | boolean | null>;
  return {
    id: row.id,
    event: row.event as SecurityEventName,
    category: row.category as SecurityEventCategory,
    severity: row.severity as SecurityEventSeverity,
    occurredAt: row.occurredAt.toISOString(),
    workspaceId: row.workspaceId ?? undefined,
    actorUserId: row.actorUserId ?? undefined,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    reason: row.reason ?? undefined,
    requestId: row.requestId ?? undefined,
    traceId: row.traceId ?? undefined,
    attrs: Object.keys(attrs).length ? attrs : undefined,
  };
}

export class PostgresSecurityEventsStore implements SecurityEventsStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresSecurityEventsStore {
    const { db } = createDatabase(url);
    return new PostgresSecurityEventsStore(db);
  }

  async append(event: SecurityEvent): Promise<SecurityEvent> {
    const [row] = await this.db
      .insert(securityEventTable)
      .values({
        id: event.id,
        event: event.event,
        category: event.category,
        severity: event.severity,
        occurredAt: new Date(event.occurredAt),
        workspaceId: event.workspaceId ?? null,
        actorUserId: event.actorUserId ?? null,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        reason: event.reason ?? null,
        requestId: event.requestId ?? null,
        traceId: event.traceId ?? null,
        attrs: event.attrs ?? {},
      })
      .returning();
    if (!row) throw new Error("SECURITY_EVENT_INSERT_FAILED");
    return toEvent(row);
  }

  async list(query: SecurityEventListQuery = {}): Promise<SecurityEventListPage> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const filters = [];
    if (query.workspaceId) {
      filters.push(eq(securityEventTable.workspaceId, query.workspaceId));
    }
    if (query.category) {
      filters.push(eq(securityEventTable.category, query.category));
    }
    if (query.severity) {
      filters.push(eq(securityEventTable.severity, query.severity));
    }
    const cursor = decodeSecurityEventCursor(query.cursor);
    if (cursor) {
      const cursorTime = new Date(cursor.t);
      filters.push(
        or(
          lt(securityEventTable.occurredAt, cursorTime),
          and(
            eq(securityEventTable.occurredAt, cursorTime),
            lt(securityEventTable.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(securityEventTable)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(securityEventTable.occurredAt), desc(securityEventTable.id))
      .limit(limit);

    const items = rows.map(toEvent);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        items.length === limit && last
          ? encodeSecurityEventCursor(last.occurredAt, last.id)
          : undefined,
    };
  }
}
