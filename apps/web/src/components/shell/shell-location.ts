import { spaceKindForTemplate, type SpaceKind, type WorkspaceTemplate } from "@dang/contracts";
import type { BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { isNavHrefActive } from "@/lib/navigation-v2";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import {
  breadcrumbForPathname,
  domainKeyForPathname,
  insertDomainCrumb,
  isShellPrimaryPath,
  trailParent,
} from "@/lib/shell-breadcrumb";
import { t } from "@/lib/i18n";
import { wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";

export type ShellSection = "home" | "spaces" | "workspace" | "account" | "other";
export type ShellActiveTab = "home" | "spaces" | "expenses" | "more";

export type ShellLocation = {
  pathname: string;
  search: string;
  section: ShellSection;
  activeTab: ShellActiveTab | null;
  inWorkspace: boolean;
  slug: string | null;
  spaceName: string | null;
  spaceKind: SpaceKind | null;
  primary: boolean;
  trail: BreadcrumbCrumb[];
  back: { href: string; label: string } | null;
  activeDomain: ReturnType<typeof domainKeyForPathname>;
  isHrefActive: (href: string) => boolean;
};

const SPACE_KINDS = new Set<SpaceKind>(["personal", "group", "building", "org"]);

function asKind(value: string | null): SpaceKind | null {
  if (value && SPACE_KINDS.has(value as SpaceKind)) return value as SpaceKind;
  return null;
}

function sectionFor(pathname: string, search: string): ShellSection {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  if (path === "/spaces" || path.startsWith("/spaces/") || path === "/groups" || path === "/workspaces") {
    return "spaces";
  }
  if (path === "/home" || path === "/hub" || path === "/overview" || path === "/") {
    if (params.get("view") === "spaces" || asKind(params.get("kind"))) return "spaces";
    return "home";
  }
  if (path.startsWith("/w/")) return "workspace";
  if (path === "/account" || path.startsWith("/account/")) return "account";
  return "other";
}

function activeTabFor(pathname: string, section: ShellSection): ShellActiveTab | null {
  if (section === "home") return "home";
  if (section === "spaces") return "spaces";
  if (section === "account") return "more";
  if (section === "workspace") {
    const segment = pathname.replace(/\/+$/, "").split("/").filter(Boolean)[2];
    if (segment === "record" || segment === "expenses") return "expenses";
    return null;
  }
  return null;
}

/** One place that answers “where am I?” for header, trail, back, and tabs. */
export function resolveShellLocation(input: {
  pathname: string;
  search?: string | null;
  workspaceName?: string | null;
  template?: WorkspaceTemplate | null;
}): ShellLocation {
  const pathname = input.pathname || "/";
  const search = (input.search ?? "").replace(/^\?/, "");
  const searchWithQ = search ? `?${search}` : "";
  const slug = slugFromPathname(pathname);
  const inWorkspace = Boolean(slug) && pathname.startsWith("/w/");
  const params = new URLSearchParams(search);
  const template = input.template ?? undefined;
  const spaceKind: SpaceKind | null = inWorkspace
    ? spaceKindForTemplate(template)
    : asKind(params.get("kind"));
  const spaceName = input.workspaceName?.trim() || null;
  const named = spaceName && spaceName.length > 0 ? spaceName : undefined;
  const crumbs = breadcrumbForPathname(pathname, named, searchWithQ);
  const base =
    crumbs.length > 0
      ? crumbs
      : inWorkspace
        ? [{ label: named || slug || t("nav.back") }]
        : [];
  const withDomain = insertDomainCrumb(base, pathname);
  let trail = withDomain;
  if (inWorkspace && slug) {
    const kindLabel = spaceKind ? spaceTabLabel(spaceKind) : null;
    const alreadyHome = trail[0]?.href === "/home" || trail[0]?.label === NAV_LABELS.home;
    const roots: BreadcrumbCrumb[] = [
      ...(alreadyHome ? [] : [{ label: NAV_LABELS.home, href: "/home" }]),
      ...(kindLabel && trail[0]?.label !== kindLabel
        ? [{ label: kindLabel, href: `/spaces?kind=${spaceKind}` }]
        : []),
    ];
    trail = [...roots, ...trail];
  }

  const primary = isShellPrimaryPath(pathname, searchWithQ);
  const fallback =
    inWorkspace && slug ? wPath(slug) : pathname.startsWith("/spaces") ? "/spaces" : "/home";
  const parent = trail.length > 1 ? trailParent(trail, fallback) : null;
  const here = `${pathname}${searchWithQ}`;
  const back =
    parent && parent.href !== pathname && parent.href !== here
      ? { href: parent.href, label: parent.label || t("nav.back") }
      : null;

  const section = sectionFor(pathname, search);
  return {
    pathname,
    search,
    section,
    activeTab: activeTabFor(pathname, section),
    inWorkspace,
    slug,
    spaceName: inWorkspace ? spaceName : null,
    spaceKind,
    primary,
    trail,
    back,
    activeDomain: domainKeyForPathname(pathname),
    isHrefActive: (href: string) => isNavHrefActive(pathname, href, search),
  };
}
