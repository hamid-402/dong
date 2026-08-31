import {
  bigint,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";

export const accounting = pgSchema("accounting");

export const journalSourceType = accounting.enum("journal_source_type", [
  "expense",
  "settlement",
]);

export const journalEntryStatus = accounting.enum("journal_entry_status", [
  "posted",
  "reversed",
]);

export const journalLineSide = accounting.enum("journal_line_side", [
  "debit",
  "credit",
]);

export const journalEntry = accounting.table(
  "journal_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceType: journalSourceType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    status: journalEntryStatus("status").default("posted").notNull(),
    currency: text("currency").default("IRR").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("journal_entry_source_uq").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
    ),
    uniqueIndex("journal_entry_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("journal_entry_workspace_time_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const journalLine = accounting.table(
  "journal_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntry.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    accountCode: text("account_code").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id),
    side: journalLineSide("side").notNull(),
    /** Canonical IRR minor units. */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    lineNo: integer("line_no").notNull(),
  },
  (table) => [
    index("journal_line_entry_idx").on(table.entryId, table.lineNo),
    index("journal_line_workspace_user_idx").on(table.workspaceId, table.userId),
  ],
);
