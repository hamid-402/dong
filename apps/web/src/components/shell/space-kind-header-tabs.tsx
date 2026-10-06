"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  spaceKindForTemplate,
  type SpaceKind,
  type WorkspaceSummary,
} from "@dang/contracts";
import { NAV_LABELS } from "@/lib/nav-labels";
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
  if (pathname === "/home" || pathname.startsWith("/spaces")) {
    const onList =
      (pathname === "/home" && kindQuery === tabKey) ||
      (pathname === "/spaces" && kindQuery === tabKey) ||
      (pathname.startsWith("/spaces/new") && newKindQuery === tabKey);
    return onList ? "list-active" : "idle";
  }
  // Inside a workspace: highlight current realm but do NOT treat as current page
  // (click always navigates to /home?kind=… — leave-space semantics).
  if (onWorkspace && workspaceKind === tabKey) return "current-realm";
  return "idle";
}

/**
 * Primary chrome: خانه · شخصی · گروهی · ساختمان · سازمان
 * Kind tabs always open that realm’s list on /home — never auto-enter a space.
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

  const tabs: KindTab[] = [
    { key: "home", label: NAV_LABELS.home, href: homeHref },
    {
      key: "personal",
      label: NAV_LABELS.spacePersonal,
      href: "/home?kind=personal",
    },
    {
      key: "group",
      label: NAV_LABELS.spaceGroup,
      href: "/home?kind=group",
    },
    {
      key: "building",
      label: NAV_LABELS.spaceBuilding,
      href: "/home?kind=building",
    },
    {
      key: "org",
      label: NAV_LABELS.spaceOrg,
      href: "/home?kind=org",
    },
  ].filter(
    (tab) =>
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
