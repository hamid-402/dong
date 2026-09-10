import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";
import type { BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";

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
  procurement: NAV_LABELS.procurement,
  proposals: NAV_LABELS.proposals,
  assets: NAV_LABELS.assets,
  partners: NAV_LABELS.partners,
  settings: "تنظیمات فضا",
  metrics: NAV_LABELS.metrics,
  audit: NAV_LABELS.audit,
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
  procurement: "procurement",
  proposals: "proposals",
  assets: "assets",
  partners: "partners",
  settings: "settings",
  audit: "audit",
  metrics: "metrics",
  more: "more",
};

/** Build breadcrumb crumbs from the current pathname (RTL: home → leaf). */
export function breadcrumbForPathname(
  pathname: string,
  workspaceName?: string,
): BreadcrumbCrumb[] {
  if (pathname.startsWith("/account")) {
    const crumbs: BreadcrumbCrumb[] = [
      { label: NAV_LABELS.account, href: "/account" },
    ];
    if (pathname.startsWith("/account/security")) {
      crumbs.push({ label: NAV_LABELS.security });
    } else if (pathname === "/account" || pathname === "/account/") {
      crumbs[0] = { label: NAV_LABELS.account };
    } else {
      crumbs.push({ label: NAV_LABELS.profile });
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

  const match = pathname.match(/^\/w\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return [];

  const slug = decodeURIComponent(match[1] ?? "");
  const segment = match[2];
  const spaceLabel = workspaceName?.trim() || slug;
  const crumbs: BreadcrumbCrumb[] = [{ label: spaceLabel, href: wPath(slug) }];

  if (!segment) {
    crumbs.push({ label: NAV_LABELS.home });
    return crumbs;
  }

  const page = SEGMENT_TO_PAGE[segment];
  if (page) {
    crumbs[0] = { label: spaceLabel, href: wPath(slug) };
    crumbs.push({ label: PAGE_LABEL[page] ?? segment });
  }
  return crumbs;
}
