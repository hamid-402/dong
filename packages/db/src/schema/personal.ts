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
import { userAccount } from "./iam.js";

/** User-owned money (not workspace-tenanted). */
export const personal = pgSchema("personal");

export const moneyAccountKind = personal.enum("money_account_kind", [
  "cash",
  "bank",
  "card",
  "other",
]);

export const moneyTxnKind = personal.enum("money_txn_kind", [
  "income",
  "expense",
  "transfer_in",
  "transfer_out",
  "adjustment",
]);

export const moneyAccount = personal.table(
  "money_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: moneyAccountKind("kind").notNull(),
    currency: text("currency").default("IRR").notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" })
      .default(0n)
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("money_account_owner_idempotency_uq").on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
    index("money_account_owner_idx").on(table.ownerUserId),
  ],
);

export const moneyTxn = personal.table(
  "money_txn",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => moneyAccount.id, { onDelete: "cascade" }),
    kind: moneyTxnKind("kind").notNull(),
    /** Always positive IRR minor; sign comes from kind. */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    occurredOn: date("occurred_on").notNull(),
    note: text("note"),
    categoryId: uuid("category_id"),
    transferGroupId: uuid("transfer_group_id"),
    linkedWorkspaceId: uuid("linked_workspace_id"),
    linkedExpenseId: uuid("linked_expense_id"),
    linkedSettlementId: uuid("linked_settlement_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("money_txn_owner_idempotency_uq").on(table.ownerUserId, table.idempotencyKey),
    index("money_txn_account_occurred_idx").on(table.accountId, table.occurredOn),
    index("money_txn_owner_occurred_idx").on(table.ownerUserId, table.occurredOn),
  ],
);

export const personalCategory = personal.table(
  "category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("personal_category_owner_slug_uq").on(table.ownerUserId, table.slug),
    uniqueIndex("personal_category_owner_idempotency_uq").on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
  ],
);

export const personalBudget = personal.table(
  "budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    /** Calendar month as YYYY-MM. */
    yearMonth: text("year_month").notNull(),
    limitMinor: bigint("limit_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    alertPercent: integer("alert_percent").default(80).notNull(),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("personal_budget_owner_month_uq").on(table.ownerUserId, table.yearMonth),
    uniqueIndex("personal_budget_owner_idempotency_uq").on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
  ],
);

export const personalFinanceExport = personal.table(
  "finance_export",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    fromOn: date("from_on").notNull(),
    toOn: date("to_on").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count").default(0).notNull(),
    csvBody: text("csv_body"),
    errorDetail: text("error_detail"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("personal_finance_export_owner_idempotency_uq").on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
  ],
);
