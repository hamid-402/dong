import {
  auditEvent,
  asc,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { AuditRecord, AuditStore, AuditWriteInput } from "./audit.types.js";

function mapAudit(row: typeof auditEvent.$inferSelect): AuditRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorUserId: row.actorUserId ?? undefined,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId ?? undefined,
    result: row.result as AuditRecord["result"],
    reason: row.reason ?? undefined,
    requestId: row.requestId ?? undefined,
    metadata: (row.metadata ?? {}) as AuditRecord["metadata"],
    occurredAt: row.occurredAt.toISOString(),
  };
}

export class PostgresAuditStore implements AuditStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresAuditStore {
    const { db } = createDatabase(connectionString);
    return new PostgresAuditStore(db);
  }

  async append(input: AuditWriteInput): Promise<AuditRecord> {
    if (!input.actorUserId) {
      throw new Error("AUDIT_ACTOR_REQUIRED");
    }

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const inserted = await tx
          .insert(auditEvent)
          .values({
            workspaceId: input.workspaceId,
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            result: input.result,
            reason: input.reason,
            requestId: input.requestId,
            metadata: input.metadata ?? {},
          })
          .returning();

        const row = inserted[0];
        if (!row) {
          throw new Error("AUDIT_INSERT_FAILED");
        }
        return mapAudit(row);
      },
    );
  }

  async listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AuditRecord[] | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.workspaceId, workspaceId))
          .orderBy(asc(auditEvent.occurredAt));

        return rows.map(mapAudit);
      },
    );
  }
}
