/** Canonical workspace-scoped paths (Phase 2 IA). */

export type WorkspacePage =
  | "home"
  | "space"
  | "expenses"
  | "settlements"
  | "invoices"
  | "recurring"
  | "addons"
  | "approvals"
  | "orgFinance"
  | "ledger"
  | "members"
  | "procurement"
  | "proposals"
  | "assets"
  | "partners"
  | "settings"
  | "metrics"
  | "more";

const PAGE_SEGMENTS: Record<WorkspacePage, string> = {
  home: "",
  space: "/space",
  expenses: "/expenses",
  settlements: "/settlements",
  invoices: "/invoices",
  recurring: "/recurring",
  addons: "/addons",
  approvals: "/approvals",
  orgFinance: "/org-finance",
  ledger: "/ledger",
  members: "/members",
  procurement: "/procurement",
  proposals: "/proposals",
  assets: "/assets",
  partners: "/partners",
  settings: "/settings",
  metrics: "/metrics",
  more: "/more",
};

export function wPath(slug: string, page: WorkspacePage = "home"): string {
  const segment = PAGE_SEGMENTS[page];
  return segment ? `/w/${encodeURIComponent(slug)}${segment}` : `/w/${encodeURIComponent(slug)}`;
}

/** Map classic / hub-era pathnames to a workspace page key. */
export function classicPathToWorkspacePage(pathname: string): WorkspacePage | "account" | "spaces" | "spaces-new" | "invite" | null {
  const normalized = pathname.replace(/\/$/, "") || "/";
  switch (normalized) {
    case "/overview":
    case "/":
      return "home";
    case "/workspaces":
      return "expenses";
    case "/daily-ledger":
      return "ledger";
    case "/workspaces/invite":
      return "members";
    case "/workspaces/procurement":
      return "procurement";
    case "/proposals":
      return "proposals";
    case "/workspaces/assets":
      return "assets";
    case "/workspaces/partnership":
      return "partners";
    case "/me":
    case "/group":
    case "/groups":
    case "/orgs":
      return "space";
    case "/profile":
      return "account";
    case "/onboarding":
      return "spaces-new";
    case "/invite":
      return "invite";
    default:
      return null;
  }
}

export function absoluteForPage(
  page: ReturnType<typeof classicPathToWorkspacePage>,
  slug: string | null,
): string {
  if (page === "account") return "/account";
  if (page === "spaces") return "/spaces";
  if (page === "spaces-new") return "/spaces/new";
  if (page === "invite") return "/invite";
  if (!page) return slug ? wPath(slug) : "/spaces";
  if (!slug) return "/spaces";
  return wPath(slug, page);
}
