import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./iam.js";

export const ops = pgSchema("ops");

export const outboxEvent = ops.table(
  "outbox_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    requestId: text("request_id"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  },
  (table) => [
    index("ops_outbox_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

/** Local key vault ciphertext — plaintext never stored (R10-06). */
export const vaultSecret = ops.table(
  "vault_secret",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    ciphertext: text("ciphertext").notNull(),
    wrappedDek: text("wrapped_dek").notNull(),
    masterKeyVersion: integer("master_key_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("vault_secret_name_version_uidx").on(table.name, table.version),
    index("vault_secret_name_idx").on(table.name, table.version),
  ],
);

/** Platform-scoped vault encrypt/decrypt access log (Phase 2.2). No tenant RLS. */
export const vaultAccessLog = ops.table(
  "vault_access_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    secretRef: text("secret_ref").notNull(),
    operation: text("operation").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ops_vault_access_log_time_idx").on(table.occurredAt, table.id),
    index("ops_vault_access_log_secret_idx").on(table.secretRef, table.occurredAt),
  ],
);

/** Platform-scoped security events (R10-15). No tenant RLS. */
export const securityEvent = ops.table(
  "security_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    event: text("event").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspace.id),
    actorUserId: uuid("actor_user_id"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    requestId: text("request_id"),
    traceId: text("trace_id"),
    attrs: jsonb("attrs").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    index("ops_security_event_time_idx").on(table.occurredAt, table.id),
    index("ops_security_event_cat_sev_idx").on(
      table.category,
      table.severity,
      table.occurredAt,
    ),
    index("ops_security_event_workspace_idx").on(table.workspaceId),
  ],
);

/**
 * Job history (durable when Postgres).
 * Enqueue writes status accepted/completed; worker may write-back completed/failed + finished_at.
 */
export const jobRun = ops.table(
  "job_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull(),
    execution: text("execution").notNull(),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    unique("ops_job_run_job_id_uq").on(table.jobId),
    index("ops_job_run_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

/** Outbound workspace webhooks (G15 depth / migration 0081). */
export const workspaceWebhook = ops.table(
  "workspace_webhook",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: jsonb("events").$type<string[]>().default([]).notNull(),
    secret: text("secret").notNull(),
    active: boolean("active").default(true).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ops_workspace_webhook_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("ops_workspace_webhook_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

/** Delivery attempts for outbound webhooks (R8 / migration 0086). */
export const workspaceWebhookDelivery = ops.table(
  "workspace_webhook_delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => workspaceWebhook.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ops_workspace_webhook_delivery_ws_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("ops_workspace_webhook_delivery_hook_created_idx").on(
      table.webhookId,
      table.createdAt,
    ),
  ],
);
