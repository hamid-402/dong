import {
  boolean,
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

export const iam = pgSchema("iam");

export const workspaceTemplate = iam.enum("workspace_template", [
  "personal",
  "friends_family",
  "household",
  "project_partners",
  "small_team",
  "construction",
  "residential_building",
]);

export const membershipRole = iam.enum("membership_role", [
  "owner",
  "admin",
  "finance",
  "deputy_finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
  "guest",
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
    /** Unique handle; NULL for legacy accounts until claimed. */
    username: text("username"),
    /** E.164 phone; optional. */
    phone: text("phone"),
    /** sha256(pepper ‖ phone) for contact matching — never store raw contact uploads. */
    phoneHash: text("phone_hash"),
    /** Always null until an SMS provider is wired; UI must not claim verified. */
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    /** Platform-level role: user | platform_support | platform_owner */
    platformRole: text("platform_role").default("user").notNull(),
    /** Prefer rial/toman in UI; null = follow workspace. */
    displayUnit: text("display_unit"),
    usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
    /** Platform console disable (S11-13). */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledByUserId: uuid("disabled_by_user_id"),
    disabledReason: text("disabled_reason"),
    /** Base32 TOTP secret (plaintext at rest for local; encrypt in production). */
    totpSecret: text("totp_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_account_external_subject_uq").on(table.externalSubject),
    uniqueIndex("user_account_username_uq").on(table.username),
    uniqueIndex("user_account_phone_uq").on(table.phone),
    index("user_account_phone_hash_idx").on(table.phoneHash),
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

/** One-time MFA recovery codes (hashed). */
export const authMfaRecovery = iam.table(
  "auth_mfa_recovery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_mfa_recovery_code_hash_uq").on(table.codeHash),
    index("auth_mfa_recovery_user_idx").on(table.userId),
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
    displayUnit: text("display_unit").default("rial").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
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
    disabledByUserId: uuid("disabled_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    disabledReason: text("disabled_reason"),
    /** invite | friend | join_request | user_id | seed */
    addedVia: text("added_via").default("invite").notNull(),
    addedByUserId: uuid("added_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({
      name: "membership_pk",
      columns: [table.workspaceId, table.userId],
    }),
    index("membership_user_id_idx").on(table.userId),
  ],
);

/** Named guest without account — claimable later by phone/token (G04 #1). */
export const guestPlaceholder = iam.table(
  "guest_placeholder",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    phoneE164: text("phone_e164"),
    claimTokenHash: text("claim_token_hash").notNull(),
    claimedUserId: uuid("claimed_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("guest_placeholder_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("guest_placeholder_workspace_idx").on(table.workspaceId),
    uniqueIndex("guest_placeholder_claim_token_uq").on(table.claimTokenHash),
  ],
);

/** Pending join requests; partial unique (workspace, user) while status=pending. */
export const workspaceJoinRequest = iam.table(
  "workspace_join_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    message: text("message"),
    status: text("status").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    grantedRole: text("granted_role"),
  },
  (table) => [
    index("workspace_join_request_workspace_idx").on(table.workspaceId, table.status),
    index("workspace_join_request_user_idx").on(table.userId, table.status),
  ],
);

/** Two-step ownership handoff; previous owner demotes to admin on accept. */
export const workspaceOwnershipTransfer = iam.table(
  "workspace_ownership_transfer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("workspace_ownership_transfer_workspace_idx").on(table.workspaceId, table.status),
  ],
);

export const userNotificationPref = iam.table("user_notification_pref", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  emailDigest: text("email_digest").default("off").notNull(),
  expensePosted: boolean("expense_posted").default(true).notNull(),
  settlementClaimed: boolean("settlement_claimed").default(true).notNull(),
  inviteAccepted: boolean("invite_accepted").default(true).notNull(),
  securityAlert: boolean("security_alert").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Coach / tour dismissals + directory pins — account-backed with localStorage fallback on web. */
export const userUiPref = iam.table("user_ui_pref", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  dismissShellTour: boolean("dismiss_shell_tour").default(false).notNull(),
  dismissStatementsTour: boolean("dismiss_statements_tour").default(false).notNull(),
  /** Ordered workspace ids for directory switcher pins (max 8 in API). */
  pinnedWorkspaceIds: jsonb("pinned_workspace_ids")
    .$type<string[]>()
    .default([])
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspacePlan = iam.table("workspace_plan", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  plan: text("plan").default("free").notNull(),
  seatsLimit: integer("seats_limit"),
  featuresJson: text("features_json"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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

/** S11-04: per-workspace role grants over ABAC actions. */
export const workspaceRoleGrant = iam.table(
  "workspace_role_grant",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    action: text("action").notNull(),
    effect: text("effect").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "workspace_role_grant_pk",
      columns: [table.workspaceId, table.role, table.action],
    }),
  ],
);

export const membershipPermissionOverride = iam.table(
  "membership_permission_override",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    effect: text("effect").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "membership_permission_override_pk",
      columns: [table.workspaceId, table.userId, table.action],
    }),
  ],
);

export const deputyFinanceWindow = iam.table(
  "deputy_finance_window",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").default("").notNull(),
    approvalCapMinor: text("approval_cap_minor"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("deputy_finance_window_ws_user_idx").on(
      table.workspaceId,
      table.userId,
      table.startsAt,
    ),
  ],
);

/** S11-13 — temporary platform access to a workspace's financial data. */
export const platformBreakGlass = iam.table(
  "platform_break_glass",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ticketRef: text("ticket_ref"),
  },
  (table) => [
    index("platform_break_glass_actor_idx").on(table.actorUserId, table.expiresAt),
    index("platform_break_glass_ws_idx").on(table.workspaceId, table.expiresAt),
  ],
);

/** Building units / org departments / subsidiaries inside one workspace. */
export const workspaceSubunit = iam.table(
  "workspace_subunit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    note: text("note"),
    sortOrder: integer("sort_order").default(0).notNull(),
    areaSqm: numeric("area_sqm"),
    occupancy: integer("occupancy"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_subunit_code_uq").on(table.workspaceId, table.code),
    index("workspace_subunit_ws_idx").on(table.workspaceId, table.sortOrder),
  ],
);

export const workspaceSubunitMember = iam.table(
  "workspace_subunit_member",
  {
    subunitId: uuid("subunit_id")
      .notNull()
      .references(() => workspaceSubunit.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.subunitId, table.userId] }),
    index("workspace_subunit_member_user_idx").on(table.userId),
  ],
);

/** Saved kind-report filter presets (G07). */
export const userReportView = iam.table(
  "user_report_view",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    months: integer("months").notNull(),
    sortKey: text("sort_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("user_report_view_user_idx").on(table.userId, table.updatedAt)],
);
