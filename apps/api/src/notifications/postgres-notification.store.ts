import {
  and,
  createDatabase,
  desc,
  eq,
  notification,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CreateNotificationInput, NotificationSummary } from "@dang/contracts";
import type { NotificationStore } from "./notification.store.js";

function mapNotification(row: typeof notification.$inferSelect): NotificationSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    channel: row.channel as NotificationSummary["channel"],
    title: row.title,
    body: row.body,
    metadata: (row.metadata ?? {}),
    readAt: row.readAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresNotificationStore implements NotificationStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresNotificationStore {
    const { db } = createDatabase(connectionString);
    return new PostgresNotificationStore(db);
  }

  async create(actorUserId: string, input: CreateNotificationInput): Promise<NotificationSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const inserted = await tx
          .insert(notification)
          .values({
            workspaceId: input.workspaceId,
            userId: input.userId,
            channel: input.channel,
            title: input.title,
            body: input.body,
            metadata: input.metadata ?? {},
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("NOTIFICATION_INSERT_FAILED");
        return mapNotification(row);
      },
    );
  }

  async listForUser(workspaceId: string, userId: string): Promise<NotificationSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(notification)
          .where(and(eq(notification.workspaceId, workspaceId), eq(notification.userId, userId)))
          .orderBy(desc(notification.createdAt));
        return rows.map(mapNotification);
      },
    );
  }

  async markRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
  ): Promise<NotificationSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(notification)
          .where(
            and(
              eq(notification.id, notificationId),
              eq(notification.workspaceId, workspaceId),
              eq(notification.userId, userId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new Error("NOTIFICATION_NOT_FOUND");
        const updated = await tx
          .update(notification)
          .set({ readAt: new Date() })
          .where(eq(notification.id, notificationId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("NOTIFICATION_NOT_FOUND");
        return mapNotification(row);
      },
    );
  }
}
