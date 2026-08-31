import type {
  CreateNotificationInput,
  NotificationSummary,
} from "@dang/contracts";

export type NotificationStore = {
  readonly persistence: "memory" | "postgres";
  create(input: CreateNotificationInput): Promise<NotificationSummary>;
  listForUser(workspaceId: string, userId: string): Promise<NotificationSummary[]>;
  markRead(workspaceId: string, userId: string, notificationId: string): Promise<NotificationSummary>;
};

export const NOTIFICATION_STORE = Symbol("NOTIFICATION_STORE");

export class MemoryNotificationStore implements NotificationStore {
  readonly persistence = "memory" as const;
  private readonly items = new Map<string, NotificationSummary>();

  create(input: CreateNotificationInput): Promise<NotificationSummary> {
    const notification: NotificationSummary = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      channel: input.channel,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    this.items.set(notification.id, notification);
    return Promise.resolve(notification);
  }

  listForUser(workspaceId: string, userId: string): Promise<NotificationSummary[]> {
    return Promise.resolve(
      [...this.items.values()]
        .filter((n) => n.workspaceId === workspaceId && n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  markRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
  ): Promise<NotificationSummary> {
    const existing = this.items.get(notificationId);
    if (!existing || existing.workspaceId !== workspaceId || existing.userId !== userId) {
      return Promise.reject(new Error("NOTIFICATION_NOT_FOUND"));
    }
    const updated: NotificationSummary = {
      ...existing,
      readAt: new Date().toISOString(),
    };
    this.items.set(notificationId, updated);
    return Promise.resolve(updated);
  }
}
