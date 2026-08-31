import {
  bigint,
  date,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";

export const procurement = pgSchema("procurement");

export const needStatus = procurement.enum("need_status", [
  "open",
  "fulfilled",
  "cancelled",
]);

export const purchaseRequestStatus = procurement.enum("purchase_request_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "ordered",
  "cancelled",
]);

export const budgetStatus = procurement.enum("budget_status", ["open", "closed"]);

export const need = procurement.table(
  "need",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    estimatedAmountMinor: bigint("estimated_amount_minor", { mode: "bigint" }),
    currency: text("currency").default("IRR"),
    status: needStatus("status").default("open").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("need_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const purchaseRequest = procurement.table(
  "purchase_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    needId: uuid("need_id").references(() => need.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    vendorName: text("vendor_name"),
    status: purchaseRequestStatus("status").default("draft").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("pr_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const budget = procurement.table(
  "budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ceilingMinor: bigint("ceiling_minor", { mode: "bigint" }).notNull(),
    committedMinor: bigint("committed_minor", { mode: "bigint" }).default(0n).notNull(),
    spentMinor: bigint("spent_minor", { mode: "bigint" }).default(0n).notNull(),
    currency: text("currency").default("IRR").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: budgetStatus("status").default("open").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("budget_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);
