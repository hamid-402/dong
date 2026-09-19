import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
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
    /** Optional link to income_source (S11-10). */
    incomeSourceId: uuid("income_source_id"),
    /** Optional link to savings_goal (S11-10). */
    savingsGoalId: uuid("savings_goal_id"),
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

export const incomeSourceKind = personal.enum("income_source_kind", [
  "salary",
  "bonus",
  "freelance",
  "rent",
  "other",
]);

export const incomeCadence = personal.enum("income_cadence", [
  "monthly",
  "weekly",
  "yearly",
  "irregular",
]);

export const savingsGoalStatus = personal.enum("savings_goal_status", [
  "active",
  "reached",
  "archived",
]);

export const spendingAlertScope = personal.enum("spending_alert_scope", [
  "total",
  "category",
  "group",
  "workspace",
]);

export const spendingAlertPeriod = personal.enum("spending_alert_period", [
  "month",
  "week",
]);

export const spendingAlertChannel = personal.enum("spending_alert_channel", [
  "inapp",
  "email",
]);

export const incomeSource = personal.table(
  "income_source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: incomeSourceKind("kind").notNull(),
    expectedMinor: bigint("expected_minor", { mode: "bigint" }),
    cadence: incomeCadence("cadence").default("monthly").notNull(),
    currency: text("currency").default("IRR").notNull(),
    active: boolean("active").default(true).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("income_source_user_idempotency_uq").on(table.userId, table.idempotencyKey),
    index("income_source_user_idx").on(table.userId),
  ],
);

export const savingsGoal = personal.table(
  "savings_goal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetMinor: bigint("target_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    targetDate: date("target_date"),
    accountId: uuid("account_id").references(() => moneyAccount.id, {
      onDelete: "set null",
    }),
    status: savingsGoalStatus("status").default("active").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("savings_goal_user_idempotency_uq").on(table.userId, table.idempotencyKey),
    index("savings_goal_user_idx").on(table.userId),
  ],
);

export const savingsGoalContribution = personal.table(
  "savings_goal_contribution",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => savingsGoal.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    txnId: uuid("txn_id").references(() => moneyTxn.id, { onDelete: "set null" }),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("savings_goal_contribution_goal_idempotency_uq").on(
      table.goalId,
      table.idempotencyKey,
    ),
    index("savings_goal_contribution_goal_idx").on(table.goalId),
  ],
);

export const spendingAlert = personal.table(
  "spending_alert",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    scope: spendingAlertScope("scope").notNull(),
    refId: uuid("ref_id"),
    period: spendingAlertPeriod("period").default("month").notNull(),
    limitMinor: bigint("limit_minor", { mode: "bigint" }).notNull(),
    thresholdPercent: integer("threshold_percent").default(80).notNull(),
    channel: spendingAlertChannel("channel").default("inapp").notNull(),
    active: boolean("active").default(true).notNull(),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("spending_alert_user_idx").on(table.userId)],
);

export const monthlyClose = personal.table(
  "monthly_close",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    incomeMinor: bigint("income_minor", { mode: "bigint" }).default(0n).notNull(),
    expenseMinor: bigint("expense_minor", { mode: "bigint" }).default(0n).notNull(),
    groupShareMinor: bigint("group_share_minor", { mode: "bigint" }).default(0n).notNull(),
    personalMinor: bigint("personal_minor", { mode: "bigint" }).default(0n).notNull(),
    savedMinor: bigint("saved_minor", { mode: "bigint" }).default(0n).notNull(),
    topCategoryId: uuid("top_category_id"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.yearMonth] })],
);
