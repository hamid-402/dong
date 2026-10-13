"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  spaceKindForTemplate,
  type MembershipRole,
  type SpaceKind,
  type WorkspaceSummary,
  type WorkspaceTemplate,
} from "@dang/contracts";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  homeDomainHref,
  parseDomainGroup,
  spaceNav,
  spaceNavItemHint,
  type SpaceNavFlags,
} from "@/lib/navigation-v2";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";

type KindTab = {
  key: "home" | SpaceKind;
  label: string;
  href: string;
};

export type KindTabVisualState = "idle" | "list-active" | "current-realm";

/** Pure helper — exported for unit tests. */
export function kindTabVisualState(input: {
  tabKey: KindTab["key"];
  pathname: string;
  homeHref: string;
  kindQuery: string | null;
  newKindQuery: string | null;
  workspaceKind: SpaceKind | null;
  onWorkspace: boolean;
}): KindTabVisualState {
  const { tabKey, pathname, homeHref, kindQuery, newKindQuery, workspaceKind, onWorkspace } =
    input;
  if (tabKey === "home") {
    const onHome = pathname === "/home" || pathname === homeHref;
    return onHome && !kindQuery ? "list-active" : "idle";
  }
  if (
    pathname === "/home" ||
    pathname.startsWith("/spaces") ||
    pathname === "/groups" ||
    pathname === "/workspaces"
  ) {
    const onList =
      (pathname === "/home" && kindQuery === tabKey) ||
      (pathname === "/spaces" && kindQuery === tabKey) ||
      (pathname === "/groups" && kindQuery === tabKey) ||
      (pathname === "/workspaces" && kindQuery === tabKey) ||
      (pathname.startsWith("/spaces/new") && newKindQuery === tabKey);
    return onList ? "list-active" : "idle";
  }
  // Inside a workspace: highlight current realm but do NOT treat as current page
  // (click always navigates to /spaces?kind=… — leave-space semantics).
  if (onWorkspace && workspaceKind === tabKey) return "current-realm";
  return "idle";
}

/** Domain tab is current when the page or `?folder=` sits in that section. */
export function sectionTabActive(input: {
  sectionKey: string;
  activeDomain: string | null;
  folder: string | null;
}): boolean {
  return input.activeDomain === input.sectionKey || input.folder === input.sectionKey;
}

/** Space-home tab — only the workspace root, not a domain folder or a subpage. */
export function spaceHomeTabActive(input: {
  pathname: string;
  slug: string;
  activeDomain: string | null;
  folder: string | null;
}): boolean {
  if (input.activeDomain || input.folder) return false;
  const path = input.pathname.replace(/\/+$/, "") || "/";
  return path === `/w/${input.slug}`;
}

/**
 * Primary chrome: خانه · شخصی · گروهی · ساختمان · سازمان
 * Kind tabs always open that realm’s list on /spaces — never auto-enter a space.
 */
export function SpaceKindHeaderTabs({
  workspaces,
  activeWorkspaceId,
  homeHref = "/home",
  offeredKinds,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId?: string | null;
  homeHref?: string;
  /** When set, only these realm tabs render. Home always stays. */
  offeredKinds?: ReadonlySet<SpaceKind>;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const kindQuery = search.get("kind");
  const onWorkspace = /^\/w\//.test(pathname);
  const workspaceKind =
    onWorkspace && activeWorkspaceId
      ? spaceKindForTemplate(
          workspaces.find((w) => w.id === activeWorkspaceId)?.template,
        )
      : null;

  const allTabs: KindTab[] = [
    { key: "home", label: NAV_LABELS.home, href: homeHref },
    {
      key: "personal",
      label: NAV_LABELS.spacePersonal,
      href: "/spaces?kind=personal",
    },
    {
      key: "group",
      label: NAV_LABELS.spaceGroup,
      href: "/spaces?kind=group",
    },
    {
      key: "building",
      label: NAV_LABELS.spaceBuilding,
      href: "/spaces?kind=building",
    },
    {
      key: "org",
      label: NAV_LABELS.spaceOrg,
      href: "/spaces?kind=org",
    },
  ];
  const tabs = allTabs.filter(
    (tab): tab is KindTab =>
      tab.key === "home" || !offeredKinds || offeredKinds.has(tab.key),
  );

  return (
    <nav className="spaceKindTabs" aria-label={t("shell.kindTabsAria")}>
      {tabs.map((tab) => {
        const state = kindTabVisualState({
          tabKey: tab.key,
          pathname,
          homeHref,
          kindQuery,
          newKindQuery: search.get("kind"),
          workspaceKind,
          onWorkspace,
        });
        const listActive = state === "list-active";
        const currentRealm = state === "current-realm";
        const className = [
          "spaceKindTabs__tab",
          listActive ? "is-active" : "",
          currentRealm ? "is-current-realm" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={className}
            data-kind={tab.key === "home" ? undefined : tab.key}
            aria-current={listActive ? "page" : undefined}
            aria-label={
              tab.key === "home"
                ? t("shell.kindTabHomeAria")
                : t("shell.kindTabListAria", { kind: tab.label })
            }
            title={
              tab.key === "home"
                ? undefined
                : t("shell.kindTabListHint", { kind: tab.label })
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Inside a space: domain tabs, then that section’s links, on one scrolling line.
 * The catalog shortcut stays beside this row. Leave stays on the space switcher.
 */
export function WorkspaceSectionTabs({
  template,
  slug,
  flags,
  role,
  pathname,
  folder,
  activeDomain,
  isHrefActive,
}: {
  template: WorkspaceTemplate | undefined;
  slug: string;
  flags?: SpaceNavFlags;
  role?: MembershipRole | null;
  pathname: string;
  folder?: string | null;
  activeDomain?: string | null;
  isHrefActive?: (href: string) => boolean;
}) {
  const sections = spaceNav(template, slug, flags, role);
  const catalogHref = wPath(slug, "catalog");
  const domain = activeDomain ?? null;
  const folderKey = folder ?? null;
  const homeActive = spaceHomeTabActive({
    pathname,
    slug,
    activeDomain: domain,
    folder: folderKey,
  });

  return (
    <nav className="shell-sectionTabs" aria-label={t("shell.opsRoomDomains")}>
      <Link
        href={wPath(slug)}
        className={`shell-sectionTabs__tab shell-sectionTabs__tab--section${homeActive ? " is-active" : ""}`}
        aria-current={homeActive ? "page" : undefined}
      >
        {NAV_LABELS.space}
      </Link>
      {sections.map((section) => {
        const key = parseDomainGroup(section.key);
        if (!key) return null;
        const active = sectionTabActive({
          sectionKey: key,
          activeDomain: domain,
          folder: folderKey,
        });
        const items = section.items.filter((item) => item.href !== catalogHref);
        return (
          <div
            key={key}
            className={`shell-sectionTabs__group${active ? " is-current" : ""}`}
            role="group"
            aria-label={section.label}
          >
            <Link
              href={homeDomainHref(slug, key)}
              className={`shell-sectionTabs__tab shell-sectionTabs__tab--section${active ? " is-active" : ""}`}
              aria-current={active ? "true" : undefined}
              data-section={key}
            >
              {section.label}
            </Link>
            {items.map((item) => {
              const itemActive = isHrefActive?.(item.href) ?? false;
              const hint = spaceNavItemHint(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`shell-sectionTabs__tab shell-sectionTabs__tab--item${itemActive ? " is-active" : ""}`}
                  aria-current={itemActive ? "page" : undefined}
                  title={hint && hint !== item.label ? hint : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
