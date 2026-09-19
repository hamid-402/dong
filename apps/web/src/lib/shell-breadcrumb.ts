import { NAV_LABELS } from "@/lib/nav-labels";
import { MAX_BREADCRUMB_DEPTH } from "@/lib/page-pattern";
import {
  MOSAIC_INTENT_LABEL,
  domainGroupLabel,
  domainSubGroupLabel,
  parseDomainGroup,
  parseDomainSubGroup,
  parseMosaicIntent,
} from "@/lib/navigation-v2";
import {
  statementRangeFromSearch,
  statementsListHref,
} from "@/lib/statement-links";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";
import type { BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { t } from "@/lib/i18n";

function searchFrom(search?: string | null): URLSearchParams {
  const raw = (search ?? "").startsWith("?")
    ? (search ?? "").slice(1)
    : (search ?? "");
  return new URLSearchParams(raw);
}

const PAGE_LABEL: Partial<Record<WorkspacePage, string>> = {
  home: NAV_LABELS.home,
  space: NAV_LABELS.space,
  expenses: NAV_LABELS.expenses,
  settlements: NAV_LABELS.settlements,
  invoices: NAV_LABELS.invoices,
  recurring: NAV_LABELS.recurring,
  addons: NAV_LABELS.addons,
  approvals: NAV_LABELS.approvals,
  orgFinance: NAV_LABELS.orgFinance,
  ledger: NAV_LABELS.ledger,
  members: NAV_LABELS.members,
  subunits: NAV_LABELS.subunits,
  permissions: NAV_LABELS.permissions,
  procurement: NAV_LABELS.procurement,
  proposals: NAV_LABELS.proposals,
  assets: NAV_LABELS.assets,
  catalog: NAV_LABELS.catalog,
  statements: NAV_LABELS.statements,
  charts: NAV_LABELS.charts,
  payments: NAV_LABELS.payments,
  partners: NAV_LABELS.partners,
  settings: NAV_LABELS.settings,
  metrics: NAV_LABELS.metrics,
  audit: NAV_LABELS.audit,
  securityOps: NAV_LABELS.securityOps,
  jobs: NAV_LABELS.jobs,
  more: NAV_LABELS.more,
};

const SEGMENT_TO_PAGE: Record<string, WorkspacePage> = {
  space: "space",
  expenses: "expenses",
  settlements: "settlements",
  invoices: "invoices",
  recurring: "recurring",
  addons: "addons",
  approvals: "approvals",
  "org-finance": "orgFinance",
  ledger: "ledger",
  members: "members",
  subunits: "subunits",
  permissions: "permissions",
  procurement: "procurement",
  proposals: "proposals",
  assets: "assets",
  catalog: "catalog",
  statements: "statements",
  charts: "charts",
  payments: "payments",
  partners: "partners",
  settings: "settings",
  audit: "audit",
  "security-ops": "securityOps",
  metrics: "metrics",
  jobs: "jobs",
  more: "more",
};

/**
 * Primary tab / root surfaces — no path trail; full product header.
 * Subpages (and home/more domain folders) swap the header for back + crumbs.
 */
export function isShellPrimaryPath(
  pathname: string,
  search?: string | null,
): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/home" || path === "/spaces" || path === "/account") return true;
  if (path === "/whats-new") return false;

  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "admin" || parts[0] === "platform") return false;
  if (parts[0] === "me") return false;
  if (parts[0] !== "w" || !parts[1]) return false;

  const segment = parts[2];
  const params = searchFrom(search);
  if (!segment) {
    // Workspace home is primary — but ?folder= drills into a domain subgroup.
    return parseDomainGroup(params.get("folder")) == null;
  }
  if (parts.length > 3) return false; // nested detail

  if (segment === "expenses" || segment === "space") return true;
  if (segment === "more") {
    const intent = parseMosaicIntent(params.get("intent"));
    const folder = parseDomainGroup(params.get("folder"));
    return intent == null && folder == null;
  }
  return false;
}

/**
 * Parent href for the shell back control — last ancestor with href, else fallback.
 * Current (leaf) crumbs typically omit href.
 */
export function trailParentHref(
  crumbs: BreadcrumbCrumb[],
  fallback = "/spaces",
): string {
  for (let i = crumbs.length - 2; i >= 0; i -= 1) {
    const href = crumbs[i]?.href;
    if (href) return href;
  }
  const root = crumbs[0]?.href;
  if (root) return root;
  return fallback;
}

/** Build breadcrumb crumbs from the current pathname (RTL: home → leaf). */
export function breadcrumbForPathname(
  pathname: string,
  workspaceName?: string,
  search?: string | null,
): BreadcrumbCrumb[] {
  if (pathname.startsWith("/admin") || pathname.startsWith("/platform")) {
    const crumbs: BreadcrumbCrumb[] = [
      { label: NAV_LABELS.account, href: "/account" },
      { label: NAV_LABELS.admin, href: "/admin" },
    ];
    if (pathname.includes("/vault")) {
      crumbs.push({ label: NAV_LABELS.adminVault });
    } else if (pathname.includes("/slo")) {
      crumbs.push({ label: NAV_LABELS.adminSlo });
    } else {
      crumbs[1] = { label: NAV_LABELS.admin };
    }
    return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
  }

  if (pathname.startsWith("/account")) {
    const crumbs: BreadcrumbCrumb[] = [
      { label: NAV_LABELS.account, href: "/account" },
    ];
    if (pathname.startsWith("/account/security")) {
      crumbs.push({ label: NAV_LABELS.security });
    } else if (pathname.startsWith("/account/friends")) {
      crumbs.push({ label: NAV_LABELS.friends });
    } else if (pathname.startsWith("/account/privacy")) {
      crumbs.push({ label: NAV_LABELS.privacy });
    } else if (pathname === "/account" || pathname === "/account/") {
      crumbs[0] = { label: NAV_LABELS.account };
    } else {
      crumbs.push({ label: NAV_LABELS.profile });
    }
    return crumbs;
  }

  if (pathname.startsWith("/me/finance") || pathname.startsWith("/me")) {
    const crumbs: BreadcrumbCrumb[] = [
      { label: NAV_LABELS.account, href: "/account" },
    ];
    if (pathname.startsWith("/me/finance")) {
      crumbs.push({ label: NAV_LABELS.personalFinance });
    }
    return crumbs;
  }

  if (pathname.startsWith("/whats-new")) {
    return [
      { label: NAV_LABELS.account, href: "/account" },
      { label: NAV_LABELS.whatsNew },
    ];
  }

  if (pathname.startsWith("/spaces")) {
    const crumbs: BreadcrumbCrumb[] = [{ label: NAV_LABELS.spacesList, href: "/spaces" }];
    if (pathname.startsWith("/spaces/new")) {
      crumbs.push({ label: NAV_LABELS.createSpace });
    }
    return crumbs;
  }

  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "w" || !parts[1]) return [];

  const slug = decodeURIComponent(parts[1] ?? "");
  const segment = parts[2];
  const detail = parts[3];
  const sub = parts[4];
  const spaceLabel = workspaceName?.trim() || slug;
  const crumbs: BreadcrumbCrumb[] = [{ label: spaceLabel, href: wPath(slug) }];
  const params = searchFrom(search);

  if (!segment) {
    const homeFolder = parseDomainGroup(params.get("folder"));
    if (homeFolder) {
      const homeGroup = parseDomainSubGroup(homeFolder, params.get("group"));
      if (homeGroup) {
        crumbs.push({
          label: domainGroupLabel(homeFolder),
          href: `${wPath(slug)}?folder=${homeFolder}`,
        });
        crumbs.push({ label: domainSubGroupLabel(homeFolder, homeGroup) });
        return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
      }
      crumbs.push({ label: NAV_LABELS.home, href: wPath(slug) });
      crumbs.push({ label: domainGroupLabel(homeFolder) });
      return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
    }
    crumbs.push({ label: NAV_LABELS.home });
    return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
  }

  const page = SEGMENT_TO_PAGE[segment];
  if (!page) {
    crumbs.push({ label: segment });
    return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
  }

  // Level 3 only for known detail routes (e.g. statements/[userId]/print).
  if (detail && page === "statements") {
    const range = statementRangeFromSearch(search);
    crumbs.push({
      label: PAGE_LABEL.statements ?? NAV_LABELS.statements,
      href: statementsListHref(slug, range),
    });
    crumbs.push({
      label:
        sub === "print" || detail === "print"
          ? t("statements.breadcrumbPrint")
          : t("statements.breadcrumbMember"),
    });
    return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
  }

  if (page === "more") {
    const intent = parseMosaicIntent(params.get("intent"));
    const moreFolder = parseDomainGroup(params.get("folder"));
    if (moreFolder) {
      const moreGroup = parseDomainSubGroup(moreFolder, params.get("group"));
      if (moreGroup) {
        crumbs.push({
          label: domainGroupLabel(moreFolder),
          href: `${wPath(slug, "more")}?folder=${moreFolder}`,
        });
        crumbs.push({ label: domainSubGroupLabel(moreFolder, moreGroup) });
        return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
      }
      crumbs.push({
        label: PAGE_LABEL.more ?? NAV_LABELS.more,
        href: wPath(slug, "more"),
      });
      crumbs.push({ label: domainGroupLabel(moreFolder) });
      return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
    }
    if (intent) {
      crumbs.push({
        label: PAGE_LABEL.more ?? NAV_LABELS.more,
        href: wPath(slug, "more"),
      });
      crumbs.push({ label: MOSAIC_INTENT_LABEL[intent] });
      return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
    }
    crumbs.push({ label: PAGE_LABEL.more ?? NAV_LABELS.more });
    return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
  }

  crumbs.push({ label: PAGE_LABEL[page] ?? segment });
  return crumbs.slice(0, MAX_BREADCRUMB_DEPTH);
}
