import {
  bigint,
  boolean,
  index,
  integer,
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

export const catalog = pgSchema("catalog");

export const unit = catalog.table(
  "unit",
  {
    code: text("code").primaryKey(),
    labelFa: text("label_fa").notNull(),
    labelEn: text("label_en").notNull(),
    kind: text("kind").notNull(),
    baseCode: text("base_code"),
    baseFactor: numeric("base_factor", { precision: 18, scale: 6 }),
    isSystem: boolean("is_system").default(false).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [index("unit_workspace_idx").on(table.workspaceId)],
);

export const catalogCategory = catalog.table(
  "catalog_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("catalog_category_workspace_idx").on(table.workspaceId, table.sortOrder),
  ],
);

export const catalogItem = catalog.table(
  "catalog_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerKind: text("owner_kind").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
    ownerUserId: uuid("owner_user_id").references(() => userAccount.id, {
      onDelete: "cascade",
    }),
    categoryId: uuid("category_id").references(() => catalogCategory.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    unitCode: text("unit_code")
      .notNull()
      .references(() => unit.code),
    referencePriceMinor: bigint("reference_price_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    description: text("description"),
    sku: text("sku"),
    barcode: text("barcode"),
    active: boolean("active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("catalog_item_workspace_name_uq")
      .on(table.workspaceId, table.nameNormalized)
      .where(sql`${table.ownerKind} = 'workspace' AND ${table.archivedAt} IS NULL`),
    uniqueIndex("catalog_item_user_name_uq")
      .on(table.ownerUserId, table.nameNormalized)
      .where(sql`${table.ownerKind} = 'user' AND ${table.archivedAt} IS NULL`),
    index("catalog_item_workspace_active_idx").on(table.workspaceId, table.active),
    index("catalog_item_user_active_idx").on(table.ownerUserId, table.active),
  ],
);

export const catalogItemPrice = catalog.table(
  "catalog_item_price",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => catalogItem.id, { onDelete: "cascade" }),
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    note: text("note"),
  },
  (table) => [index("catalog_item_price_item_idx").on(table.itemId, table.effectiveFrom)],
);

export const catalogItemUsage = catalog.table(
  "catalog_item_usage",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => catalogItem.id, { onDelete: "cascade" }),
    useCount: integer("use_count").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.itemId] }),
    index("catalog_item_usage_freq_idx").on(
      table.workspaceId,
      table.useCount,
      table.lastUsedAt,
    ),
  ],
);

export const catalogItemPin = catalog.table(
  "catalog_item_pin",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => catalogItem.id, { onDelete: "cascade" }),
    pinnedByUserId: uuid("pinned_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).defaultNow().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.itemId] }),
    index("catalog_item_pin_sort_idx").on(table.workspaceId, table.sortOrder),
  ],
);
