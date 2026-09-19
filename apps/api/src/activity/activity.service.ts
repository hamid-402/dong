import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { ActivityItem, ActivityPage, AuthActor } from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { NOTIFICATION_STORE, type NotificationStore } from "../notifications/notification.store.js";

@Injectable()
export class ActivityService {
  constructor(
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async list(
    actor: AuthActor,
    workspaceId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<ActivityPage> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }

    const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
    const auditRows = (await this.audit.listForWorkspace(workspaceId, actor.userId)) ?? [];
    const notifRows = await this.notifications.listForUser(workspaceId, actor.userId);

    const items: ActivityItem[] = [];
    for (const row of auditRows) {
      items.push({
        id: `audit:${row.id}`,
        kind: "audit",
        workspaceId,
        createdAt: row.occurredAt,
        title: row.action,
        body: row.reason ?? `${row.targetType}${row.targetId ? `:${row.targetId}` : ""}`,
        action: row.action,
        actorUserId: row.actorUserId,
        metadata: {
          result: row.result,
          targetType: row.targetType,
          ...(row.targetId ? { targetId: row.targetId } : {}),
        },
      });
    }
    for (const n of notifRows) {
      items.push({
        id: `notification:${n.id}`,
        kind: "notification",
        workspaceId,
        createdAt: n.createdAt,
        title: n.title,
        body: n.body,
        action: n.metadata?.event,
        href: n.metadata?.route,
        metadata: n.metadata,
      });
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    let start = 0;
    if (opts?.cursor) {
      const idx = items.findIndex((item) => item.id === opts.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const page = items.slice(start, start + limit);
    const next = items[start + limit];
    return {
      items: page,
      nextCursor: next ? page[page.length - 1]?.id : undefined,
    };
  }
}
