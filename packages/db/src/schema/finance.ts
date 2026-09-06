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
  "itemized",
]);

export const settlementStatus = finance.enum("settlement_status", [
  "claimed",
  "confirmed",
  "disputed",
  "cancelled",
]);

export const periodKind = finance.enum("period_kind", [
  "day",
  "week",
  "month",
  "year",
  "custom",
]);

export const periodStatus = finance.enum("period_status", [
  "open",
  "review",
  "closed",
  "cancelled",
]);

export const expenseVisibility = finance.enum("expense_visibility", [
  "shared",
  "private",
  "company",
]);

export const invoiceStatus = finance.enum("invoice_status", [
  "draft",
  "pending_approval",
  "disputed",
  "approved",
  "issued",
  "paid",
  "cancelled",
]);

export const expensePeriod = finance.table(
  "expense_period",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: periodKind("kind").notNull(),
    status: periodStatus("status").default("open").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
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
    uniqueIndex("expense_period_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("expense_period_workspace_range_idx").on(
      table.workspaceId,
      table.startsOn,
      table.endsOn,
    ),
  ],
);

export const outing = finance.table(
  "outing",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
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
    uniqueIndex("outing_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    index("outing_workspace_time_idx").on(table.workspaceId, table.createdAt),
  ],
);

/** Per-day note + manual holiday flag for the daily consumption ledger. */
export const workspaceDay = finance.table(
  "workspace_day",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    dayOn: date("day_on").notNull(),
    isHoliday: boolean("is_holiday").default(false).notNull(),
    note: text("note"),
    holidayReversedExpenseIds: uuid("holiday_reversed_expense_ids")
      .array()
      .default([])
      .notNull(),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "workspace_day_pk",
      columns: [table.workspaceId, table.dayOn],
    }),
    index("workspace_day_workspace_range_idx").on(table.workspaceId, table.dayOn),
  ],
);

/** Active/unlocked range locks for daily ledger month/period close. */
export const workspaceRangeLock = finance.table(
  "workspace_range_lock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    rangeStart: date("range_start").notNull(),
    rangeEnd: date("range_end").notNull(),
    reason: text("reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    lockedByUserId: uuid("locked_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
    unlockedByUserId: uuid("unlocked_by_user_id").references(() => userAccount.id),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workspace_range_lock_idem_uq").on(table.workspaceId, table.idempotencyKey),
    index("workspace_range_lock_workspace_idx").on(
      table.workspaceId,
      table.rangeStart,
      table.rangeEnd,
    ),
  ],
);

export const expenseCategory = finance.table(
  "expense_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("expense_category_workspace_slug_uq").on(table.workspaceId, table.slug),
  ],
);

export const expense = finance.table(
  "expense",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodId: uuid("period_id").references(() => expensePeriod.id, {
      onDelete: "set null",
    }),
    outingId: uuid("outing_id").references(() => outing.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    note: text("note"),
    /** Provenance: e.g. daily_ledger — null = classic finance create. */
    source: text("source"),
    status: expenseStatus("status").default("draft").notNull(),
    visibility: expenseVisibility("visibility").default("shared").notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    tipMinor: bigint("tip_minor", { mode: "bigint" }),
    taxMinor: bigint("tax_minor", { mode: "bigint" }),
    discountMinor: bigint("discount_minor", { mode: "bigint" }),
    categoryId: uuid("category_id").references(() => expenseCategory.id, {
      onDelete: "set null",
    }),
    budgetId: uuid("budget_id"),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => userAccount.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
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
    index("expense_period_id_idx").on(table.periodId),
    index("expense_outing_id_idx").on(table.outingId),
  ],
);

export const expenseItem = finance.table(
  "expense_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    title: text("title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    notes: text("notes"),
  },
  (table) => [index("expense_item_expense_idx").on(table.expenseId, table.lineNo)],
);

export const expenseItemAssignment = finance.table(
  "expense_item_assignment",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => expenseItem.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id),
    shares: integer("shares").default(1).notNull(),
  },
  (table) => [
    primaryKey({
      name: "expense_item_assignment_pk",
      columns: [table.itemId, table.userId],
    }),
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

export const memberInvoice = finance.table(
  "member_invoice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => expensePeriod.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => userAccount.id),
    status: invoiceStatus("status").default("draft").notNull(),
    currency: text("currency").default("IRR").notNull(),
    sharedTotalMinor: bigint("shared_total_minor", { mode: "bigint" })
      .default(0n)
      .notNull(),
    privateTotalMinor: bigint("private_total_minor", { mode: "bigint" })
      .default(0n)
      .notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).default(0n).notNull(),
    disputeNote: text("dispute_note"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("member_invoice_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("member_invoice_period_member_uq").on(
      table.periodId,
      table.memberUserId,
    ),
    index("member_invoice_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const memberInvoiceLine = finance.table(
  "member_invoice_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => memberInvoice.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    visibility: expenseVisibility("visibility").notNull(),
    title: text("title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    lineNo: integer("line_no").notNull(),
  },
  (table) => [
    index("member_invoice_line_invoice_idx").on(table.invoiceId, table.lineNo),
  ],
);

export const paymentLinkStatus = finance.enum("payment_link_status", [
  "created",
  "opened",
  "paid",
  "failed",
  "expired",
  "cancelled",
]);

export const paymentProvider = finance.enum("payment_provider", [
  "stub",
  "zarinpal",
  "idpay",
]);

export const paymentLink = finance.table(
  "payment_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    settlementId: uuid("settlement_id").references(() => settlement.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id").references(() => memberInvoice.id, {
      onDelete: "set null",
    }),
    provider: paymentProvider("provider").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    description: text("description").notNull(),
    checkoutUrl: text("checkout_url").notNull(),
    status: paymentLinkStatus("status").default("created").notNull(),
    providerRef: text("provider_ref").notNull(),
    returnUrl: text("return_url").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("payment_link_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("payment_link_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

/** Server-owned Zarinpal authority → amount (callback must not trust query amount). */
export const pendingZarinpalPayment = finance.table("pending_zarinpal_payment", {
  authority: text("authority").primaryKey(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  paymentLinkId: uuid("payment_link_id").references(() => paymentLink.id, {
    onDelete: "set null",
  }),
  status: text("status").default("pending").notNull(),
  refId: text("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const recurringRule = finance.table(
  "recurring_rule",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    cadence: text("cadence").notNull(),
    nextRunOn: date("next_run_on").notNull(),
    visibility: expenseVisibility("visibility").default("private").notNull(),
    splitMethod: splitMethod("split_method").default("equal").notNull(),
    categoryId: uuid("category_id").references(() => expenseCategory.id, {
      onDelete: "set null",
    }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("recurring_rule_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
  ],
);

export const reportExport = finance.table(
  "report_export",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    format: text("format").notNull(),
    fromOn: date("from_on").notNull(),
    toOn: date("to_on").notNull(),
    groupBy: text("group_by").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count").default(0).notNull(),
    csvBody: text("csv_body"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("report_export_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);
