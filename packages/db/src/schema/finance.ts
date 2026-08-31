import {
  bigint,
  date,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";

export const finance = pgSchema("finance");

export const expenseStatus = finance.enum("expense_status", [
  "draft",
  "submitted",
  "posted",
  "reversed",
]);

export const splitMethod = finance.enum("split_method", [
  "equal",
  "amount",
  "percent",
  "shares",
]);

export const settlementStatus = finance.enum("settlement_status", [
  "claimed",
  "confirmed",
  "disputed",
  "cancelled",
]);

export const expense = finance.table(
  "expense",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
    status: expenseStatus("status").default("draft").notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    paidByUserId: uuid("paid_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    splitMethod: splitMethod("split_method").notNull(),
    occurredOn: date("occurred_on").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("expense_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("expense_workspace_time_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const expenseSplitLine = finance.table(
  "expense_split_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    percentBp: integer("percent_bp"),
    shares: integer("shares"),
    lineNo: integer("line_no").notNull(),
  },
  (table) => [
    index("expense_split_expense_idx").on(table.expenseId, table.lineNo),
  ],
);

export const expensePaymentLine = finance.table(
  "expense_payment_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    lineNo: integer("line_no").notNull(),
  },
  (table) => [
    index("expense_payment_expense_idx").on(table.expenseId, table.lineNo),
  ],
);

export const settlement = finance.table(
  "settlement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => userAccount.id),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    status: settlementStatus("status").default("claimed").notNull(),
    paymentLinkUrl: text("payment_link_url"),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("settlement_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("settlement_workspace_time_idx").on(table.workspaceId, table.createdAt),
  ],
);
