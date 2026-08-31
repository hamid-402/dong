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
  | "friends_family"
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
};

export const workspaceTemplateCatalog: WorkspaceTemplateCatalogItem[] = [
  {
    id: "friends_family",
    titleFa: "دوستان و خانواده",
    summaryFa: "خرج مشترک، قبوض، تجهیز خانگی و تسویه سریع",
    defaultModules: ["expenses", "settlements", "assets_light"],
  },
  {
    id: "project_partners",
    titleFa: "شرکای پروژه",
    summaryFa: "آورده، قرض شریک، مالکیت، خرید و گزارش پروژه",
    defaultModules: ["expenses", "partnerships", "procurement", "reports"],
  },
  {
    id: "small_team",
    titleFa: "تیم اداری کوچک",
    summaryFa: "بودجه، درخواست، تأیید، خرید، تحویل و تجهیزات",
    defaultModules: ["procurement", "assets", "budgets", "approvals"],
  },
  {
    id: "construction",
    titleFa: "ساختمان و پیمانکاری",
    summaryFa: "پروژه، مصالح، پیمانکار، تحویل جزئی و سهم شرکا",
    defaultModules: ["procurement", "assets", "partnerships", "projects"],
  },
];

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
  joinedAt: string;
};

export type AuthActor = {
  userId: string;
  externalSubject: string;
  displayName: string;
  authMode: "oidc" | "dev";
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

/** Future browser session contract after Authorization Code + PKCE. */
export type SessionSummary = {
  authenticated: boolean;
  mode: "anonymous" | "dev" | "oidc";
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
};

export type AcceptInviteRequest = {
  token: string;
};

export * from "./assets.js";
export * from "./collaboration.js";
export * from "./files.js";
export * from "./finance.js";
export * from "./jobs.js";
export * from "./partnership.js";
export * from "./payments.js";
export * from "./procurement.js";
