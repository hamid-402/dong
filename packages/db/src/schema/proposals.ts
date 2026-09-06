import {
  bigint,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { userAccount, workspace } from "./iam.js";
import { need } from "./procurement.js";

export const proposals = pgSchema("proposals");

export const proposalKind = proposals.enum("proposal_kind", ["goods", "service"]);
export const proposalStatus = proposals.enum("proposal_status", [
  "open",
  "accepted",
  "rejected",
  "withdrawn",
]);
export const voteChoice = proposals.enum("vote_choice", ["yes", "no"]);

export const workspaceProposalSettings = proposals.table("workspace_proposal_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  quorumPercent: integer("quorum_percent").default(51).notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => userAccount.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const proposal = proposals.table(
  "proposal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: proposalKind("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    estimatedAmountMinor: bigint("estimated_amount_minor", { mode: "bigint" }),
    currency: text("currency").default("IRR"),
    status: proposalStatus("status").default("open").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    acceptedNeedId: uuid("accepted_need_id").references(() => need.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("proposal_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    index("proposal_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const proposalVote = proposals.table(
  "proposal_vote",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposal.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    choice: voteChoice("choice").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.proposalId, table.userId] })],
);
