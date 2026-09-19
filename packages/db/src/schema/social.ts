import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccount } from "./iam.js";

export const social = pgSchema("social");

export const userDirectorySetting = social.table("user_directory_setting", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  findableByUsername: boolean("findable_by_username").default(true).notNull(),
  findableByPhone: boolean("findable_by_phone").default(true).notNull(),
  findableByEmail: boolean("findable_by_email").default(false).notNull(),
  allowFriendRequests: boolean("allow_friend_requests").default(true).notNull(),
  allowGroupInvites: boolean("allow_group_invites").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const friendship = social.table(
  "friendship",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    addresseeUserId: uuid("addressee_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    /** least(a,b) || ':' || greatest(a,b) — unique pair key. */
    pairKey: text("pair_key").notNull(),
    status: text("status").notNull(),
    blockedByUserId: uuid("blocked_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("friendship_pair_key_uq").on(table.pairKey),
    index("friendship_requester_idx").on(table.requesterUserId, table.status),
    index("friendship_addressee_idx").on(table.addresseeUserId, table.status),
  ],
);

export const contactSyncRun = social.table(
  "contact_sync_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
    submittedCount: integer("submitted_count").notNull(),
    matchedCount: integer("matched_count").notNull(),
    source: text("source").notNull(),
  },
  (table) => [index("contact_sync_run_user_idx").on(table.userId, table.ranAt)],
);
