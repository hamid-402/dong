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
  | "auditor";

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
export * from "./schemas/index.js";
