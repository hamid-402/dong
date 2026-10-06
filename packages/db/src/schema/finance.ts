import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  "formula",
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
    /** manual | jalali_month — jalali_month periods are opened by the rollover job. */
    cadence: text("cadence").default("manual").notNull(),
    autoRollover: boolean("auto_rollover").default(false).notNull(),
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
    /** Optional event budget ceiling in IRR minor (G04 EventBudget). */
    budgetCapMinor: bigint("budget_cap_minor", { mode: "bigint" }),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
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

/** Named split templates for a workspace (G04 #7). */
export const workspaceSplitPreset = finance.table(
  "workspace_split_preset",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    splitMethod: text("split_method").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_split_preset_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("workspace_split_preset_workspace_idx").on(table.workspaceId),
  ],
);

export const workspaceSplitPresetLine = finance.table(
  "workspace_split_preset_line",
  {
    presetId: uuid("preset_id")
      .notNull()
      .references(() => workspaceSplitPreset.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    shares: integer("shares"),
    percentBp: integer("percent_bp"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
  },
  (table) => [primaryKey({ columns: [table.presetId, table.userId] })],
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
    /** Optional parent for hierarchical categories (Dong 2.0 Wave 1). */
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("expense_category_workspace_slug_uq").on(table.workspaceId, table.slug),
    index("expense_category_workspace_parent_idx").on(table.workspaceId, table.parentId),
  ],
);

export const costCenter = finance.table(
  "cost_center",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("cost_center_workspace_code_uq").on(
      table.workspaceId,
      table.code,
    ),
    index("cost_center_workspace_active_idx").on(
      table.workspaceId,
      table.active,
    ),
  ],
);

export const memberAllowance = finance.table(
  "member_allowance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    periodKind: text("period_kind").notNull(),
    limitMinor: bigint("limit_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    alertPct: integer("alert_pct").default(80).notNull(),
    active: boolean("active").default(true).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("member_allowance_active_member_period_uq")
      .on(table.workspaceId, table.memberUserId, table.periodKind)
      .where(sql`${table.active}`),
    uniqueIndex("member_allowance_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("member_allowance_workspace_active_idx").on(
      table.workspaceId,
      table.active,
    ),
  ],
);

export const workspaceExpensePolicy = finance.table("workspace_expense_policy", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  approvalThresholdMinor: bigint("approval_threshold_minor", { mode: "bigint" }),
  requireReceiptAboveMinor: bigint("require_receipt_above_minor", { mode: "bigint" }),
  /** Category ids that always require a receipt attachment (additive to amount gate). */
  requireReceiptCategoryIds: jsonb("require_receipt_category_ids")
    .$type<string[]>()
    .default([])
    .notNull(),
  requireCostCenter: boolean("require_cost_center").default(false).notNull(),
  approvalTiersJson: text("approval_tiers_json"),
  perDiemDailyMinor: bigint("per_diem_daily_minor", { mode: "bigint" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedByUserId: uuid("updated_by")
    .notNull()
    .references(() => userAccount.id),
});

/** Workspace-scoped tags for expenses (G03 #18). */
export const expenseTag = finance.table(
  "expense_tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
  },
  (table) => [
    uniqueIndex("expense_tag_workspace_slug_uq").on(table.workspaceId, table.slug),
    index("expense_tag_workspace_idx").on(table.workspaceId),
  ],
);

export const expenseTagLink = finance.table(
  "expense_tag_link",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => expenseTag.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.tagId] }),
    index("expense_tag_link_tag_idx").on(table.workspaceId, table.tagId),
    index("expense_tag_link_expense_idx").on(table.workspaceId, table.expenseId),
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
    costCenterId: uuid("cost_center_id").references(() => costCenter.id, {
      onDelete: "set null",
    }),
    budgetId: uuid("budget_id"),
    audience: text("audience").default("all_members").notNull(),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => userAccount.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    currency: text("currency").default("IRR").notNull(),
    originalCurrency: text("original_currency"),
    originalAmountMinor: bigint("original_amount_minor", { mode: "bigint" }),
    fxRateId: uuid("fx_rate_id"),
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
    /** S11-07 catalog snapshot for non-itemized / daily-ledger lines. */
    catalogItemId: uuid("catalog_item_id"),
    unitCode: text("unit_code"),
    quantity: numeric("quantity", { precision: 18, scale: 3 }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }),
    /** S11-09 funding source (petty cash / personal / member / credit). */
    fundingSourceKind: text("funding_source_kind"),
    fundingRefId: uuid("funding_ref_id"),
    /** Travel advance/settlement (G09 #35). */
    missionKind: text("mission_kind"),
  },
  (table) => [
    uniqueIndex("expense_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("expense_workspace_time_idx").on(table.workspaceId, table.createdAt),
    index("expense_period_id_idx").on(table.periodId),
    index("expense_outing_id_idx").on(table.outingId),
    index("expense_cost_center_id_idx").on(table.workspaceId, table.costCenterId),
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
    catalogItemId: uuid("catalog_item_id"),
    unitCode: text("unit_code"),
    quantity: numeric("quantity", { precision: 18, scale: 3 }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }),
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
    /** Live projection bookkeeping: bumped on each recalculation. */
    version: integer("version").default(1).notNull(),
    recalculatedAt: timestamp("recalculated_at", { withTimezone: true }),
    /** Fingerprint of the committed lines; equal hash = skip rewrite. */
    sourceHash: text("source_hash"),
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

/**
 * Correction notice for an invoice the member already acted on.
 * The locked document stays byte-for-byte immutable; the delta lives here.
 */
export const memberInvoiceAdjustment = finance.table(
  "member_invoice_adjustment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => memberInvoice.id, { onDelete: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => expensePeriod.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => userAccount.id),
    /** Signed: positive = debit note, negative = credit note. */
    deltaMinor: bigint("delta_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("member_invoice_adjustment_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("member_invoice_adjustment_invoice_idx").on(
      table.invoiceId,
      table.createdAt,
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
    /** Optional item-level enrichment (S11-08); null = legacy expense-level line. */
    expenseItemId: uuid("expense_item_id"),
    catalogItemId: uuid("catalog_item_id"),
    itemNameSnapshot: text("item_name_snapshot"),
    unitCode: text("unit_code"),
    quantity: numeric("quantity", { precision: 18, scale: 6 }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }),
    shareRatio: text("share_ratio"),
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
  "local_psp",
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
  /** Absolute app URL to redirect the browser after verify (nullable for legacy rows). */
  returnUrl: text("return_url"),
  status: text("status").default("pending").notNull(),
  refId: text("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

/** Server-owned LocalPSP intent → amount (verify must not trust client amount). */
export const pendingLocalPspPayment = finance.table("pending_local_psp_payment", {
  intentId: text("intent_id").primaryKey(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: text("currency").default("IRR").notNull(),
  description: text("description").notNull(),
  returnUrl: text("return_url").notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  paymentLinkId: uuid("payment_link_id").references(() => paymentLink.id, {
    onDelete: "set null",
  }),
  status: text("status").default("pending").notNull(),
  refId: text("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
    version: integer("version").default(1).notNull(),
    effectiveFrom: date("effective_from"),
    supersedesRuleId: uuid("supersedes_rule_id"),
    autoConfirm: boolean("auto_confirm").default(false).notNull(),
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

export const reimbursementRequest = finance.table(
  "reimbursement_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id").references(() => expense.id, { onDelete: "set null" }),
    claimantUserId: uuid("claimant_user_id").notNull().references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    title: text("title").notNull(),
    status: text("status").default("draft").notNull(),
    note: text("note"),
    decidedBy: uuid("decided_by").references(() => userAccount.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reimbursement_request_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    index("reimbursement_request_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const categoryBudget = finance.table(
  "category_budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => expenseCategory.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    limitMinor: bigint("limit_minor", { mode: "bigint" }).notNull(),
    alertPct: integer("alert_pct").default(80).notNull(),
    currency: text("currency").default("IRR").notNull(),
    active: boolean("active").default(true).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: uuid("created_by").notNull().references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("category_budget_month_uq").on(table.workspaceId, table.categoryId, table.yearMonth),
    uniqueIndex("category_budget_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const approvalWorkflowStep = finance.table(
  "approval_workflow_step",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id").notNull().references(() => expense.id, { onDelete: "cascade" }),
    stepNo: integer("step_no").notNull(),
    approverUserId: uuid("approver_user_id").notNull().references(() => userAccount.id),
    status: text("status").default("pending").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("approval_workflow_step_expense_no_uq").on(table.expenseId, table.stepNo)],
);

/** Multi-level approval decisions — multiple rows per request until requiredApprovals (Phase 2.3). */
export const approvalDecision = finance.table(
  "approval_decision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    requestType: text("request_type").notNull(),
    requestId: uuid("request_id").notNull(),
    amountMinor: text("amount_minor").notNull(),
    approverUserId: uuid("approver_user_id")
      .notNull()
      .references(() => userAccount.id),
    decision: text("decision").notNull(),
    approverRole: text("approver_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("approval_decision_approver_uq").on(
      table.workspaceId,
      table.requestType,
      table.requestId,
      table.approverUserId,
    ),
    index("approval_decision_request_idx").on(
      table.workspaceId,
      table.requestType,
      table.requestId,
      table.createdAt,
    ),
  ],
);

/** Global system table: no tenant RLS; runtime reads and feature-gated writes. */
export const fxRate = finance.table(
  "fx_rate",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rateNumeric: text("rate_numeric").notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("fx_rate_pair_date_uq").on(table.baseCurrency, table.quoteCurrency, table.asOf)],
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

/** Member statement CSV/JSON export jobs (S11-08). */
export const statementExport = finance.table(
  "statement_export",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => userAccount.id),
    fromOn: date("from_on").notNull(),
    toOn: date("to_on").notNull(),
    format: text("format").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count").default(0).notNull(),
    body: text("body"),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Soft retention — body may be purged after this instant. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("statement_export_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("statement_export_expires_at_idx").on(table.expiresAt),
  ],
);

/**
 * Workspace receiving-account instructions for statement display.
 * Not PSP custody — never used on payment-link payloads.
 */
export const workspacePayoutProfile = finance.table("workspace_payout_profile", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  holderName: text("holder_name").notNull(),
  destinationKind: text("destination_kind").notNull(),
  destinationValue: text("destination_value").notNull(),
  bankName: text("bank_name"),
  updatedByUserId: uuid("updated_by_user_id")
    .notNull()
    .references(() => userAccount.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Personal add-on within a group (Dong 2.0) — FSM pending_ack → confirmed | disputed. */
export const addonChargeStatus = finance.enum("addon_charge_status", [
  "pending_ack",
  "confirmed",
  "disputed",
]);

export const personalAddonCharge = finance.table(
  "personal_addon_charge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    targetMemberUserId: uuid("target_member_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    categoryId: uuid("category_id").references(() => expenseCategory.id, {
      onDelete: "set null",
    }),
    linkedExpenseId: uuid("linked_expense_id").references(() => expense.id, {
      onDelete: "set null",
    }),
    status: addonChargeStatus("status").default("pending_ack").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("personal_addon_charge_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("personal_addon_charge_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("personal_addon_charge_target_idx").on(
      table.workspaceId,
      table.targetMemberUserId,
    ),
  ],
);

/** S11-09 — manual payment receipts (card-to-card etc.). */
export const paymentReceiptMethod = finance.enum("payment_receipt_method", [
  "card_to_card",
  "cash",
  "bank_transfer",
  "gateway",
]);

export const paymentReceiptStatus = finance.enum("payment_receipt_status", [
  "submitted",
  "approved",
  "rejected",
]);

export const paymentReceipt = finance.table(
  "payment_receipt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    settlementId: uuid("settlement_id").references(() => settlement.id, {
      onDelete: "set null",
    }),
    memberInvoiceId: uuid("member_invoice_id").references(() => memberInvoice.id, {
      onDelete: "set null",
    }),
    payerUserId: uuid("payer_user_id")
      .notNull()
      .references(() => userAccount.id),
    method: paymentReceiptMethod("method").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    referenceNo: text("reference_no"),
    destHolderName: text("dest_holder_name"),
    destLast4: text("dest_last4"),
    attachmentId: uuid("attachment_id"),
    status: paymentReceiptStatus("status").default("submitted").notNull(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => userAccount.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    journalEntryId: uuid("journal_entry_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_receipt_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("payment_receipt_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const pettyCashMovementKind = finance.enum("petty_cash_movement_kind", [
  "topup",
  "spend",
  "return",
  "adjust",
  "gift",
]);

export const pettyCashFund = finance.table(
  "petty_cash_fund",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    custodianUserId: uuid("custodian_user_id")
      .notNull()
      .references(() => userAccount.id),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" })
      .default(0n)
      .notNull(),
    currency: text("currency").default("IRR").notNull(),
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
    uniqueIndex("petty_cash_fund_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("petty_cash_fund_workspace_idx").on(table.workspaceId, table.active),
  ],
);

export const pettyCashMovement = finance.table(
  "petty_cash_movement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => pettyCashFund.id, { onDelete: "cascade" }),
    kind: pettyCashMovementKind("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    expenseId: uuid("expense_id").references(() => expense.id, {
      onDelete: "set null",
    }),
    settlementId: uuid("settlement_id").references(() => settlement.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => userAccount.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("petty_cash_movement_idempotency_uq").on(
      table.fundId,
      table.idempotencyKey,
    ),
    index("petty_cash_movement_fund_idx").on(table.fundId, table.occurredAt),
  ],
);

export const creditPurchaseStatus = finance.enum("credit_purchase_status", [
  "open",
  "partially_paid",
  "paid",
  "overdue",
]);

export const creditPurchase = finance.table(
  "credit_purchase",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    supplierRef: text("supplier_ref").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    dueDate: date("due_date").notNull(),
    status: creditPurchaseStatus("status").default("open").notNull(),
    expenseId: uuid("expense_id").references(() => expense.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("credit_purchase_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("credit_purchase_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const creditPurchasePayment = finance.table(
  "credit_purchase_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creditPurchaseId: uuid("credit_purchase_id")
      .notNull()
      .references(() => creditPurchase.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceRefId: uuid("source_ref_id"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => userAccount.id),
    receiptId: uuid("receipt_id").references(() => paymentReceipt.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("credit_purchase_payment_idempotency_uq").on(
      table.creditPurchaseId,
      table.idempotencyKey,
    ),
    index("credit_purchase_payment_purchase_idx").on(
      table.creditPurchaseId,
      table.paidAt,
    ),
  ],
);

/** S11-09 depth — pay on behalf of another member. */
export const paymentOnBehalfStatus = finance.enum("payment_on_behalf_status", [
  "pending",
  "approved",
  "rejected",
]);

export const paymentOnBehalf = finance.table(
  "payment_on_behalf",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    debtorUserId: uuid("debtor_user_id")
      .notNull()
      .references(() => userAccount.id),
    payerUserId: uuid("payer_user_id")
      .notNull()
      .references(() => userAccount.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    settlementId: uuid("settlement_id").references(() => settlement.id, {
      onDelete: "set null",
    }),
    method: paymentReceiptMethod("method").notNull(),
    note: text("note"),
    status: paymentOnBehalfStatus("status").default("pending").notNull(),
    initiatedByUserId: uuid("initiated_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => userAccount.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectNote: text("reject_note"),
    journalEntryId: uuid("journal_entry_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_on_behalf_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("payment_on_behalf_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

