import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";

export const audit = pgSchema("audit");

export const auditEvent = audit.table(
  "event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    actorUserId: uuid("actor_user_id").references(() => userAccount.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    result: text("result").notNull(),
    reason: text("reason"),
    requestId: text("request_id"),
    traceId: text("trace_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_event_workspace_time_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("audit_event_target_idx").on(table.targetType, table.targetId),
  ],
);
