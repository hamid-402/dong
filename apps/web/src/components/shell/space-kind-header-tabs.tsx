"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  spaceKindForTemplate,
  type SpaceKind,
  type WorkspaceSummary,
} from "@dang/contracts";
import { NAV_LABELS } from "@/lib/nav-labels";

type KindTab = {
  key: "home" | SpaceKind;
  label: string;
  href: string;
};

/**
 * Primary chrome: خانه · شخصی · گروهی · ساختمان · سازمان
 * Home is the app hub (not inside a workspace). Kind tabs open that realm’s list —
 * user chooses a space explicitly; we never auto-enter a group.
 */
export function SpaceKindHeaderTabs({
  workspaces,
  activeWorkspaceId,
  homeHref = "/home",
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId?: string | null;
  homeHref?: string;
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

  return (
    <nav className="spaceKindTabs" aria-label="حوزه‌های زندگی مالی">
      {tabs.map((tab) => {
        const active =
          tab.key === "home"
            ? pathname === "/home" || pathname === homeHref
            : pathname.startsWith("/spaces")
              ? kindQuery === tab.key ||
                (pathname.startsWith("/spaces/new") &&
                  search.get("kind") === tab.key)
              : workspaceKind === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`spaceKindTabs__tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
