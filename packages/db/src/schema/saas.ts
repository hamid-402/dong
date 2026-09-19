import {
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./iam.js";

export const saas = pgSchema("saas");

export const subscriptionInvoice = saas.table(
  "subscription_invoice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodMonth: text("period_month").notNull(),
    targetPlan: text("target_plan").notNull(),
    amountMinor: text("amount_minor").notNull(),
    currency: text("currency").notNull().default("IRR"),
    status: text("status").notNull(),
    paymentLinkId: uuid("payment_link_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    note: text("note").notNull().default(""),
  },
  (table) => [
    uniqueIndex("saas_sub_inv_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("saas_sub_inv_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const subscriptionPaymentMap = saas.table("subscription_payment_map", {
  paymentLinkId: uuid("payment_link_id").primaryKey(),
  subscriptionInvoiceId: uuid("subscription_invoice_id")
    .notNull()
    .references(() => subscriptionInvoice.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
