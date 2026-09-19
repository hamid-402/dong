/** Unified workspace activity feed (G11 #60) — audit-backed, optional notification rows. */

export type ActivityItemKind = "audit" | "notification";

export type ActivityItem = {
  id: string;
  kind: ActivityItemKind;
  workspaceId: string;
  createdAt: string;
  title: string;
  body?: string;
  /** Audit action or notification event name when known. */
  action?: string;
  actorUserId?: string;
  href?: string;
  metadata?: Record<string, string>;
};

export type ActivityPage = {
  items: ActivityItem[];
  nextCursor?: string;
};
