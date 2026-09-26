export type ApiHealth = {
  status: "ok";
  service: "dang-api";
  version: string;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
};

export type { Money, DisplayUnit } from "./money.js";
import type { DisplayUnit } from "./money.js";
import type { MembershipAddedVia } from "./membership.js";
import type { PlatformRole } from "./account.js";
export {
  resolveDisplayUnit,
  displayUnitLabel,
  irrMinorToDisplayInteger,
  displayIntegerToIrrMinor,
} from "./money.js";

export type WorkspaceTemplate =
  | "personal"
  | "friends_family"
  | "household"
  | "project_partners"
  | "small_team"
  | "construction"
  | "residential_building";

/** Top-level life domain for IA — personal / friends group / building / org. */
export type SpaceKind = "personal" | "group" | "building" | "org";

export type MembershipRole =
  | "owner"
  | "admin"
  | "finance"
  | "deputy_finance"
  | "approver"
  | "buyer"
  | "asset_custodian"
  | "member"
  | "auditor"
  | "guest";

/**
 * مادرخرج / مدیر مالی گروه یا سازمان — نه ادمین سراسری محصول.
 * می‌تواند خرج خصوصی اعضا را ببیند و صورتحساب بفرستد.
 * `deputy_finance` فقط وقتی بازهٔ جانشینی فعال است در لایهٔ دسترسی هم‌تراز می‌شود.
 */
export const FINANCE_MANAGER_ROLES = [
  "owner",
  "admin",
  "finance",
] as const satisfies readonly MembershipRole[];

export type FinanceManagerRole = (typeof FINANCE_MANAGER_ROLES)[number];

export function isFinanceManagerRole(
  role: string | null | undefined,
): role is FinanceManagerRole {
  return role === "owner" || role === "admin" || role === "finance";
}

/** True when role is finance or an active deputy (caller must verify window). */
export function isFinanceCapableRole(
  role: string | null | undefined,
): boolean {
  return isFinanceManagerRole(role) || role === "deputy_finance";
}

/** Law 9: non-personal spaces need ≥1 finance manager after bootstrap (≤1 member). */
export const MIN_FINANCE_MANAGERS_NON_PERSONAL = 1;

export function spaceRequiresFinanceQuorum(
  spaceKind: SpaceKind,
): boolean {
  return spaceKind !== "personal";
}

/**
 * Treasurer rule (roadmap Law 9).
 * Bootstrap: a brand-new space with a single owner may have one finance manager.
 * Once there are 2+ members, at least {@link MIN_FINANCE_MANAGERS_NON_PERSONAL}
 * finance manager is required (one is enough — backup is optional, not mandatory).
 */
export function financeManagerQuorumOk(input: {
  spaceKind: SpaceKind;
  memberCount: number;
  financeManagerCount: number;
}): { ok: true } | { ok: false; code: "FINANCE_QUORUM_REQUIRED" } {
  if (!spaceRequiresFinanceQuorum(input.spaceKind)) return { ok: true };
  if (input.memberCount <= 1) return { ok: true };
  if (input.financeManagerCount >= MIN_FINANCE_MANAGERS_NON_PERSONAL) {
    return { ok: true };
  }
  return { ok: false, code: "FINANCE_QUORUM_REQUIRED" };
}

/**
 * Whether inviting `inviteRole` into a non-personal space would leave quorum unmet
 * after the invitee joins (memberCount + 1).
 */
export function inviteSatisfiesFinanceQuorum(input: {
  spaceKind: SpaceKind;
  currentMemberCount: number;
  currentFinanceManagerCount: number;
  inviteRole: MembershipRole;
}): { ok: true } | { ok: false; code: "FINANCE_QUORUM_REQUIRED" } {
  if (!spaceRequiresFinanceQuorum(input.spaceKind)) return { ok: true };
  const nextMembers = input.currentMemberCount + 1;
  const nextFinance =
    input.currentFinanceManagerCount +
    (isFinanceManagerRole(input.inviteRole) ? 1 : 0);
  return financeManagerQuorumOk({
    spaceKind: input.spaceKind,
    memberCount: nextMembers,
    financeManagerCount: nextFinance,
  });
}

/** Auditor and temporary guest may be invited but must not mutate finance records. */
export function isReadOnlyRole(
  role: string | null | undefined,
): role is "auditor" | "guest" {
  return role === "auditor" || role === "guest";
}

/**
 * Product metrics funnel — finance managers + auditor.
 * Unknown/empty role is denied on API; UI may show nav until membership resolves.
 */
export function canViewProductMetrics(
  role: string | null | undefined,
): boolean {
  return isFinanceManagerRole(role) || role === "auditor";
}

export type WorkspaceTemplateCatalogItem = {
  id: WorkspaceTemplate;
  titleFa: string;
  summaryFa: string;
  defaultModules: string[];
  /** Additive space classification for IA — does not replace template. */
  spaceKind: SpaceKind;
};

export const workspaceTemplateCatalog: WorkspaceTemplateCatalogItem[] = [
  {
    id: "personal",
    titleFa: "فضای شخصی",
    summaryFa: "خرج و بودجه فقط برای خودم — بدون مانده گروهی",
    defaultModules: ["expenses", "invites"],
    spaceKind: "personal",
  },
  {
    id: "friends_family",
    titleFa: "گروه دوستانه",
    summaryFa: "دعوت دوستان، خرج جمعی و خصوصی، قبوض و تسویه سریع",
    defaultModules: ["expenses", "settlements", "invites", "proposals"],
    spaceKind: "group",
  },
  {
    id: "household",
    titleFa: "گروه خانواده",
    summaryFa: "خانه و خانواده — سهم‌های وزنی، خرج مشترک و تسویه جدا از دوستان",
    defaultModules: ["expenses", "settlements", "invites", "proposals"],
    spaceKind: "group",
  },
  {
    id: "residential_building",
    titleFa: "ساختمان مسکونی",
    summaryFa: "واحدها، ساکنان، شارژ ماهانه و قبوض آب و برق و گاز",
    defaultModules: [
      "expenses",
      "settlements",
      "invites",
      "budgets",
      "reports",
    ],
    spaceKind: "building",
  },
  {
    id: "project_partners",
    titleFa: "شرکای پروژه",
    summaryFa: "خرج پروژه، آورده، قرض، مالکیت، خرید و گزارش",
    defaultModules: [
      "expenses",
      "settlements",
      "invites",
      "partnerships",
      "procurement",
      "proposals",
      "reports",
    ],
    spaceKind: "org",
  },
  {
    id: "small_team",
    titleFa: "تیم / شرکت کوچک",
    summaryFa: "خرج جمعی، خصوصی و جاری شرکت + خرید و بودجه",
    defaultModules: [
      "expenses",
      "settlements",
      "invites",
      "procurement",
      "proposals",
      "assets",
      "budgets",
    ],
    spaceKind: "org",
  },
  {
    id: "construction",
    titleFa: "ساختمان و پیمانکاری",
    summaryFa: "مصالح، پیمانکار، تحویل جزئی، سهم شرکا و خرج پروژه ساختمانی",
    defaultModules: [
      "expenses",
      "settlements",
      "invites",
      "procurement",
      "proposals",
      "assets",
      "partnerships",
    ],
    spaceKind: "building",
  },
];

export function spaceKindForTemplate(
  template: WorkspaceTemplate | undefined,
): SpaceKind {
  const item = workspaceTemplateCatalog.find((entry) => entry.id === template);
  return item?.spaceKind ?? "group";
}

/** Sub-structure inside a building (unit) or org (department / subsidiary). */
export type WorkspaceSubunitKind = "unit" | "department" | "subsidiary";

export type WorkspaceSubunitSummary = {
  id: string;
  workspaceId: string;
  kind: WorkspaceSubunitKind;
  code: string;
  name: string;
  /** Optional free-form notes / rule hints for this subunit. */
  note?: string;
  sortOrder: number;
  memberUserIds: string[];
  /** Gross floor area in square metres (building units, G08). */
  areaSqm?: number;
  /** Headcount for occupancy-based formula splits (G08). */
  occupancy?: number;
  createdAt: string;
};

export type CreateWorkspaceSubunitBody = {
  kind: WorkspaceSubunitKind;
  code: string;
  name: string;
  note?: string;
  sortOrder?: number;
  areaSqm?: number;
  occupancy?: number;
};

export type UpdateWorkspaceSubunitBody = {
  name?: string;
  note?: string | null;
  sortOrder?: number;
  /** Replace assigned members when provided. */
  memberUserIds?: string[];
  areaSqm?: number | null;
  occupancy?: number | null;
};

export type CreateWorkspaceRequest = {
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  /** Owner's default split weight after create (family preset; G04 #2). */
  ownerDefaultShares?: number;
};

/** Additive workspace profile update. Slug/template remain immutable here. */
export type UpdateWorkspaceRequest = {
  name: string;
  timezone: string;
  displayUnit: "toman" | "rial";
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  timezone: string;
  displayUnit: "toman" | "rial";
  /** Soft-archive (ISO). Owners still see archived spaces in lists. */
  archivedAt?: string;
  /** Soft-delete (ISO). Excluded from chrome lists. */
  deletedAt?: string;
};

/** Body for self-leave (non-owner). */
export type LeaveWorkspaceRequest = {
  reason?: string;
};

/** Soft-delete requires typing the workspace slug. */
export type SoftDeleteWorkspaceRequest = {
  confirmSlug: string;
};

/**
 * Public-enough preview for join-by-id — no membership required.
 * Exposes only name + slug + kind so outsiders can confirm before requesting.
 */
export type WorkspaceJoinPreview = {
  slug: string;
  name: string;
  template: WorkspaceTemplate;
  spaceKind: SpaceKind;
};

export type MembershipSummary = {
  workspaceId: string;
  userId: string;
  displayName: string;
  role: MembershipRole;
  /** Relative default share weight for family/household splits (default 1). */
  defaultShares: number;
  joinedAt: string;
  /** Set when membership is soft-disabled (S11-03). */
  disabledAt?: string;
  disabledReason?: string;
  /** How the member was added (S11-03). */
  addedVia?: MembershipAddedVia;
  addedByUserId?: string;
};

export type AuthActor = {
  userId: string;
  externalSubject: string;
  displayName: string;
  authMode: "oidc" | "dev" | "password";
};

export type AuthMeResponse = {
  actor: AuthActor;
  workspaces: WorkspaceSummary[];
  /** User display-unit preference; null = follow workspace (S11-05). */
  displayUnit?: DisplayUnit | null;
  /**
   * Platform console discovery (S11-13) — from account profile.
   * Absent/undefined treated as `"user"` by clients.
   */
  platformRole?: PlatformRole;
};

export type OidcStatusResponse = {
  configured: boolean;
  allowDevAuth: boolean;
  issuerConfigured: boolean;
  clientIdConfigured: boolean;
};

/** Browser session after cookie login (password) or future OIDC PKCE. */
export type SessionSummary = {
  authenticated: boolean;
  mode: "anonymous" | "dev" | "oidc" | "password";
  actor?: AuthActor;
};

export type CreateInviteRequest = {
  role: MembershipRole;
  /** Hint for invitee: email or external subject. */
  invitedSubject?: string;
  expiresInHours?: number;
};

export type InviteSummary = {
  id: string;
  workspaceId: string;
  role: MembershipRole;
  invitedSubject?: string;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
};

export type CreateInviteResponse = InviteSummary & {
  /** Plain token shown once; only a hash is stored. */
  token: string;
  acceptPath: string;
  /** True when invite email was actually delivered (SMTP/provider). */
  emailDelivered?: boolean;
  /** Dev-only preview of invite link when mailer returns debug URL. */
  debugInviteUrl?: string;
};

export type AcceptInviteRequest = {
  token: string;
};

export * from "./account.js";
export * from "./access-policy.js";
export * from "./role-surface.js";
export * from "./persona-home.js";
export * from "./access-abac.js";
export * from "./access-grants.js";
export * from "./policy-dsl.js";
export * from "./identity.js";
export * from "./social.js";
export * from "./membership.js";
export * from "./catalog.js";
export * from "./charts.js";
export * from "./statements.js";
export * from "./statement-pack.js";
export * from "./addon-charge.js";
export * from "./assets.js";
export * from "./audit-hash.js";
export * from "./billing.js";
export * from "./billing-automation.js";
export * from "./collaboration.js";
export * from "./notification-actions.js";
export * from "./activity.js";
export * from "./webhooks.js";
export * from "./dashboard.js";
export * from "./money-intent.js";
export * from "./files.js";
export * from "./finance.js";
export * from "./building.js";
export * from "./expense-posting.js";
export * from "./jobs.js";
export * from "./outbox.js";
export * from "./partnership.js";
export * from "./payments.js";
export * from "./payment-ops.js";
export * from "./settle-pay.js";
export * from "./treasury-labels.js";
export * from "./procurement.js";
export * from "./procurement-transitions.js";
export * from "./asset-depreciation.js";
export * from "./proposals.js";
export * from "./personal-finance.js";
export * from "./personal-lifestyle.js";
export * from "./daily-ledger.js";
export * from "./dong-to-import.js";
export * from "./reports.js";
export * from "./report-views.js";
export * from "./product-metrics.js";
export * from "./analytics-warehouse.js";
export * from "./session-cookies.js";
export * from "./system.js";
export * from "./product-flags.js";
export * from "./wave-f.js";
export * from "./totp-secret-crypto.js";
export * from "./secrets-provider.js";
export * from "./key-vault.js";
export * from "./internal-job-auth.js";
export * from "./maker-checker.js";
export * from "./security-events.js";
export * from "./pen-test-status.js";
export * from "./saas-billing.js";
export * from "./platform.js";
export * from "./slo.js";
export * from "./schemas/index.js";
