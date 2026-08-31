import {
  bigint,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";
import { purchaseRequest } from "./procurement.js";

export const assetSchema = pgSchema("asset");

export const assetStatus = assetSchema.enum("asset_status", [
  "active",
  "returned",
  "damaged",
  "retired",
]);

export const vendor = assetSchema.table(
  "vendor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("vendor_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const purchaseOrderStatus = assetSchema.enum("purchase_order_status", [
  "open",
  "partially_delivered",
  "delivered",
  "cancelled",
]);

export const purchaseOrder = assetSchema.table(
  "purchase_order",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    purchaseRequestId: uuid("purchase_request_id")
      .notNull()
      .references(() => purchaseRequest.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").default("IRR").notNull(),
    status: purchaseOrderStatus("status").default("open").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("po_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const deliveryStatus = assetSchema.enum("delivery_status", [
  "complete",
  "partial",
  "discrepancy",
]);

export const delivery = assetSchema.table(
  "delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    expectedQuantity: integer("expected_quantity").notNull(),
    receivedQuantity: integer("received_quantity").notNull(),
    status: deliveryStatus("status").notNull(),
    discrepancyNote: text("discrepancy_note"),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("delivery_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const asset = assetSchema.table("asset", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  serialNumber: text("serial_number"),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id, {
    onDelete: "set null",
  }),
  deliveryId: uuid("delivery_id").references(() => delivery.id, { onDelete: "set null" }),
  acquisitionCostMinor: bigint("acquisition_cost_minor", { mode: "bigint" }),
  currency: text("currency").default("IRR"),
  ownerUserId: uuid("owner_user_id").references(() => userAccount.id),
  custodianUserId: uuid("custodian_user_id").references(() => userAccount.id),
  location: text("location"),
  status: assetStatus("status").default("active").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
