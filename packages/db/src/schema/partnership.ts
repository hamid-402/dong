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

export const partnership = pgSchema("partnership");

export const agreementStatus = partnership.enum("agreement_status", [
  "draft",
  "active",
  "superseded",
  "closed",
]);

export const agreement = partnership.table(
  "agreement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
    status: agreementStatus("status").default("draft").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agreement_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);

export const contributionKind = partnership.enum("contribution_kind", [
  "cash",
  "in_kind",
]);

export const contribution = partnership.table("contribution", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  agreementId: uuid("agreement_id")
    .notNull()
    .references(() => agreement.id, { onDelete: "cascade" }),
  memberUserId: uuid("member_user_id")
    .notNull()
    .references(() => userAccount.id),
  kind: contributionKind("kind").notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }),
  currency: text("currency").default("IRR"),
  description: text("description"),
  idempotencyKey: text("idempotency_key").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerLoanStatus = partnership.enum("partner_loan_status", [
  "open",
  "partially_repaid",
  "closed",
]);

export const partnerLoan = partnership.table("partner_loan", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  agreementId: uuid("agreement_id")
    .notNull()
    .references(() => agreement.id, { onDelete: "cascade" }),
  lenderUserId: uuid("lender_user_id")
    .notNull()
    .references(() => userAccount.id),
  borrowerUserId: uuid("borrower_user_id")
    .notNull()
    .references(() => userAccount.id),
  principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
  repaidMinor: bigint("repaid_minor", { mode: "bigint" }).default(0n).notNull(),
  currency: text("currency").default("IRR").notNull(),
  status: partnerLoanStatus("status").default("open").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const withdrawal = partnership.table("withdrawal", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  agreementId: uuid("agreement_id")
    .notNull()
    .references(() => agreement.id, { onDelete: "cascade" }),
  memberUserId: uuid("member_user_id")
    .notNull()
    .references(() => userAccount.id),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: text("currency").default("IRR").notNull(),
  reason: text("reason"),
  idempotencyKey: text("idempotency_key").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const periodLock = partnership.table(
  "period_lock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    reason: text("reason"),
    lockedByUserId: uuid("locked_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    idempotencyKey: text("idempotency_key").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("period_lock_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
  ],
);
