import {
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const iam = pgSchema("iam");

export const workspaceTemplate = iam.enum("workspace_template", [
  "personal",
  "friends_family",
  "household",
  "project_partners",
  "small_team",
  "construction",
]);

export const membershipRole = iam.enum("membership_role", [
  "owner",
  "admin",
  "finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
]);

export const userAccount = iam.table(
  "user_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalSubject: text("external_subject").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    locale: text("locale").default("fa-IR"),
    timezone: text("timezone").default("Asia/Tehran"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_account_external_subject_uq").on(table.externalSubject),
  ],
);

export const authSession = iam.table(
  "auth_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_session_token_hash_uq").on(table.tokenHash),
    index("auth_session_user_idx").on(table.userId),
  ],
);

export const authPasswordReset = iam.table(
  "auth_password_reset",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_password_reset_token_hash_uq").on(table.tokenHash),
    index("auth_password_reset_user_idx").on(table.userId),
  ],
);

export const authEmailVerify = iam.table(
  "auth_email_verify",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_email_verify_token_hash_uq").on(table.tokenHash),
    index("auth_email_verify_user_idx").on(table.userId),
  ],
);

export const workspace = iam.table(
  "workspace",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    template: workspaceTemplate("template").notNull(),
    timezone: text("timezone").default("Asia/Tehran").notNull(),
    displayUnit: text("display_unit").default("toman").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_slug_uq").on(table.slug),
    index("workspace_created_by_idx").on(table.createdBy),
  ],
);

export const membership = iam.table(
  "membership",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    defaultShares: integer("default_shares").default(1).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "membership_pk",
      columns: [table.workspaceId, table.userId],
    }),
    index("membership_user_id_idx").on(table.userId),
  ],
);

/** At most one canonical personal workspace per user (idempotent ensure). */
export const personalWorkspace = iam.table(
  "personal_workspace",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("personal_workspace_workspace_uq").on(table.workspaceId)],
);

export const invite = iam.table(
  "invite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: membershipRole("role").notNull(),
    invitedSubject: text("invited_subject"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("invite_token_hash_uq").on(table.tokenHash),
    index("invite_workspace_id_idx").on(table.workspaceId),
  ],
);
