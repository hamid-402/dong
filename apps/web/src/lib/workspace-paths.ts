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
  | "audit"
  | "metrics"
  | "more";

export type ClassicCompatTarget =
  | WorkspacePage
  | "account"
  | "spaces"
  | "spaces-new"
  | "invite";

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
  audit: "/audit",
  metrics: "/metrics",
  more: "/more",
};

/**
 * Classic / hub-era pathnames that keep bookmark compatibility via redirect pages.
 * Do not remove these app routes until analytics prove zero traffic (DESIGN-SYSTEM §12).
 */
export const CLASSIC_REDIRECT_PATHS = [
  "/",
  "/overview",
  "/workspaces",
  "/workspaces/invite",
  "/workspaces/procurement",
  "/workspaces/assets",
  "/workspaces/partnership",
  "/daily-ledger",
  "/proposals",
  "/me",
  "/group",
  "/groups",
  "/orgs",
  "/profile",
  "/onboarding",
  "/invite",
] as const;

/** Pathname-only classic → target map (hash refinements applied separately). */
export const CLASSIC_PATH_TARGETS: Readonly<Record<string, ClassicCompatTarget>> = {
  "/": "home",
  "/overview": "home",
  "/workspaces": "expenses",
  "/daily-ledger": "ledger",
  "/workspaces/invite": "members",
  "/workspaces/procurement": "procurement",
  "/proposals": "proposals",
  "/workspaces/assets": "assets",
  "/workspaces/partnership": "partners",
  "/me": "space",
  "/group": "space",
  "/groups": "space",
  "/orgs": "space",
  "/profile": "account",
  "/onboarding": "spaces-new",
  "/invite": "invite",
};

/** Panel hashes that used to live under `/workspaces` before finance split into sections. */
const WORKSPACES_HASH_TARGETS: Readonly<Record<string, WorkspacePage>> = {
  "#settlement-panel": "settlements",
  "#period-invoice-panel": "invoices",
  "#reports-panel": "recurring",
  "#expense-panel": "expenses",
  "#quick-expense": "expenses",
};

export function wPath(slug: string, page: WorkspacePage = "home"): string {
  const segment = PAGE_SEGMENTS[page];
  return segment ? `/w/${encodeURIComponent(slug)}${segment}` : `/w/${encodeURIComponent(slug)}`;
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

function normalizeHash(hash?: string | null): string {
  if (!hash) return "";
  const trimmed = hash.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * Map classic / hub-era pathnames (+ optional panel hash) to a workspace page key.
 * Hash is required for `/workspaces#settlement-panel` style bookmarks after finance split.
 */
export function classicPathToWorkspacePage(
  pathname: string,
  hash?: string | null,
): ClassicCompatTarget | null {
  const normalized = normalizePathname(pathname);
  const panel = normalizeHash(hash);

  if (normalized === "/workspaces" && panel && WORKSPACES_HASH_TARGETS[panel]) {
    return WORKSPACES_HASH_TARGETS[panel];
  }

  return CLASSIC_PATH_TARGETS[normalized] ?? null;
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
