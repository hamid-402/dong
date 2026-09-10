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

export type { Money } from "./money.js";

export type WorkspaceTemplate =
  | "personal"
  | "friends_family"
  | "household"
  | "project_partners"
  | "small_team"
  | "construction";

export type MembershipRole =
  | "owner"
  | "admin"
  | "finance"
  | "approver"
  | "buyer"
  | "asset_custodian"
  | "member"
  | "auditor"
  | "guest";

/**
 * مادرخرج / مدیر مالی گروه یا سازمان — نه ادمین سراسری محصول.
 * می‌تواند خرج خصوصی اعضا را ببیند و صورتحساب بفرستد.
 */
export const FINANCE_MANAGER_ROLES = ["owner", "admin", "finance"] as const satisfies readonly MembershipRole[];

export type FinanceManagerRole = (typeof FINANCE_MANAGER_ROLES)[number];

export function isFinanceManagerRole(
  role: string | null | undefined,
): role is FinanceManagerRole {
  return (
    role === "owner" || role === "admin" || role === "finance"
  );
}

/** Law 9: non-personal spaces need ≥2 finance managers after bootstrap (≤1 member). */
export const MIN_FINANCE_MANAGERS_NON_PERSONAL = 2;

export function spaceRequiresFinanceQuorum(
  spaceKind: "personal" | "group" | "org",
): boolean {
  return spaceKind !== "personal";
}

/**
 * Backup Treasurer rule (roadmap Law 9).
 * Bootstrap: a brand-new space with a single owner may have one finance manager.
 * Once there are 2+ members, at least {@link MIN_FINANCE_MANAGERS_NON_PERSONAL}
 * finance managers are required.
 */
export function financeManagerQuorumOk(input: {
  spaceKind: "personal" | "group" | "org";
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
  spaceKind: "personal" | "group" | "org";
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

export type WorkspaceTemplateCatalogItem = {
  id: WorkspaceTemplate;
  titleFa: string;
  summaryFa: string;
  defaultModules: string[];
  /** Additive space classification for IA — does not replace template. */
  spaceKind: "personal" | "group" | "org";
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
    summaryFa: "مصالح، پیمانکار، تحویل جزئی، سهم شرکا و خرج پروژه",
    defaultModules: [
      "expenses",
      "settlements",
      "invites",
      "procurement",
      "proposals",
      "assets",
      "partnerships",
    ],
    spaceKind: "org",
  },
];

export function spaceKindForTemplate(
  template: WorkspaceTemplate | undefined,
): "personal" | "group" | "org" {
  const item = workspaceTemplateCatalog.find((entry) => entry.id === template);
  return item?.spaceKind ?? "group";
}

export type CreateWorkspaceRequest = {
  name: string;
  slug: string;
  template: WorkspaceTemplate;
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
};

export type MembershipSummary = {
  workspaceId: string;
  userId: string;
  displayName: string;
  role: MembershipRole;
  /** Relative default share weight for family/household splits (default 1). */
  defaultShares: number;
  joinedAt: string;
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
export * from "./addon-charge.js";
export * from "./assets.js";
export * from "./billing.js";
export * from "./collaboration.js";
export * from "./dashboard.js";
export * from "./files.js";
export * from "./finance.js";
export * from "./jobs.js";
export * from "./partnership.js";
export * from "./payments.js";
export * from "./procurement.js";
export * from "./proposals.js";
export * from "./personal-finance.js";
export * from "./daily-ledger.js";
export * from "./reports.js";
export * from "./product-metrics.js";
export * from "./session-cookies.js";
export * from "./system.js";
export * from "./product-flags.js";
export * from "./wave-f.js";
export * from "./schemas/index.js";
