"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type MembershipRole,
  type SpaceKind,
  type WorkspaceTemplate,
} from "@dang/contracts";
import {
  isFinanceInsightsNavKey,
  moreSpaceNavSections,
  pickPrimarySpaceNavItems,
  spaceNav,
  spaceNavItemHint,
  type NavItemV2,
  type SpaceNavFlags,
} from "@/lib/navigation-v2";
import { OVERVIEW_SECTION_LABEL } from "@/components/shell/shell-location";
import { SpaceSectionMoreMenu } from "@/components/shell/space-section-more-menu";
import { classicPathToWorkspacePage, wPath } from "@/lib/workspace-paths";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";

/** «گزارش و نمودار» destination — charts when live, else statements. */
export function reportsChartsHref(
  slug: string,
  flags?: SpaceNavFlags,
): string {
  if (flags?.chartsV1) return wPath(slug, "charts");
  return wPath(slug, "statements");
}

type KindTab = {
  key: "home" | SpaceKind;
  label: string;
  href: string;
};

export type KindTabVisualState = "idle" | "list-active" | "current-realm";

/** Top-level in-space tab for charts + statements (insights pack). */
export const REPORTS_CHARTS_SECTION_LABEL = "گزارش و نمودار";

const MORE_DEFAULT_LABEL = "بیشتر";

function barePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Home, the space list, or a classic alias of those — via the canonical route map. */
function listSurface(pathname: string): "home" | "spaces" | "spaces-new" | null {
  const path = barePath(pathname);
  if (path === "/home") return "home";
  if (path === "/spaces") return "spaces";
  if (path === "/spaces/new" || path.startsWith("/spaces/new/")) return "spaces-new";
  const mapped = classicPathToWorkspacePage(path);
  if (mapped === "home" || mapped === "spaces" || mapped === "spaces-new") return mapped;
  return null;
}

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
  const surface = listSurface(pathname);
  if (tabKey === "home") {
    const onHome = surface === "home" || barePath(pathname) === barePath(homeHref);
    return onHome && !kindQuery ? "list-active" : "idle";
  }
  if (surface) {
    const onList =
      (surface === "home" && kindQuery === tabKey) ||
      (surface === "spaces" && kindQuery === tabKey) ||
      (surface === "spaces-new" && newKindQuery === tabKey);
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

/** «گزارش و نمودار» — charts and statements/reports surfaces inside the space. */
export function reportsChartsTabActive(input: {
  pathname: string;
  slug: string;
}): boolean {
  const path = barePath(input.pathname);
  const base = `/w/${input.slug}`;
  return (
    path === `${base}/charts` ||
    path.startsWith(`${base}/charts/`) ||
    path === `${base}/statements` ||
    path.startsWith(`${base}/statements/`)
  );
}

/** Label shown in the mobile «بخش: …» trigger — pure helper for tests. */
export function sectionTabsCurrentLabel(input: {
  homeActive: boolean;
  reportsActive: boolean;
  showReportsCharts: boolean;
  primaryItems: NavItemV2[];
  moreActiveItem: NavItemV2 | null;
  isHrefActive?: (href: string) => boolean;
}): string {
  if (input.homeActive) return OVERVIEW_SECTION_LABEL;
  if (input.showReportsCharts && input.reportsActive) {
    return REPORTS_CHARTS_SECTION_LABEL;
  }
  for (const item of input.primaryItems) {
    if (input.isHrefActive?.(item.href)) return item.label;
  }
  if (input.moreActiveItem) return input.moreActiveItem.label;
  return OVERVIEW_SECTION_LABEL;
}

/**
 * Compact in-space section row: خلاصه · گزارش و نمودار · ≤3 primary · بیشتر.
 * Mobile (<768): single «بخش: …» button + bottom sheet of all destinations.
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
  const viewport = useViewportMode();
  const isMobile = viewport === "mobile";
  const [moreOpen, setMoreOpen] = useState(false);

  const sections = useMemo(
    () => spaceNav(template, slug, flags, role),
    [template, slug, flags, role],
  );
  const showReportsCharts = Boolean(flags?.chartsV1 || flags?.statementsV1);
  const insightExclude = useMemo(() => {
    if (!showReportsCharts) return new Set<string>();
    return new Set(
      sections
        .flatMap((s) => s.items)
        .filter((item) => isFinanceInsightsNavKey(item.key))
        .map((item) => item.key),
    );
  }, [sections, showReportsCharts]);

  const primaryItems = useMemo(
    () => pickPrimarySpaceNavItems(sections, template),
    [sections, template],
  );
  const primaryKeys = useMemo(
    () => new Set(primaryItems.map((item) => item.key)),
    [primaryItems],
  );
  const moreSections = useMemo(
    () => moreSpaceNavSections(sections, primaryKeys, insightExclude),
    [sections, primaryKeys, insightExclude],
  );

  const domain = activeDomain ?? null;
  const folderKey = folder ?? null;
  const homeActive = spaceHomeTabActive({
    pathname,
    slug,
    activeDomain: domain,
    folder: folderKey,
  });
  const reportsActive = reportsChartsTabActive({ pathname, slug });

  const moreActiveItem = useMemo(() => {
    for (const section of moreSections) {
      for (const item of section.items) {
        if (isHrefActive?.(item.href)) return item;
      }
    }
    return null;
  }, [moreSections, isHrefActive]);

  const moreActive = Boolean(moreActiveItem);
  const currentLabel = sectionTabsCurrentLabel({
    homeActive,
    reportsActive,
    showReportsCharts,
    primaryItems,
    moreActiveItem,
    isHrefActive,
  });

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreTriggerLabel = moreActiveItem
    ? moreActiveItem.label
    : MORE_DEFAULT_LABEL;

  if (isMobile) {
    const sheetSections = [
      {
        key: "_pinned",
        label: "اصلی",
        items: [
          {
            key: "home",
            label: OVERVIEW_SECTION_LABEL,
            href: wPath(slug),
            icon: "home" as const,
          },
          ...(showReportsCharts
            ? [
                {
                  key: "reports-charts",
                  label: REPORTS_CHARTS_SECTION_LABEL,
                  href: reportsChartsHref(slug, flags),
                  icon: "receipt" as const,
                },
              ]
            : []),
          ...(flags?.statementsV1
            ? [
                {
                  key: "statements",
                  label: NAV_LABELS.statements,
                  href: wPath(slug, "statements"),
                  icon: "receipt" as const,
                },
              ]
            : []),
          ...primaryItems,
        ],
      },
      ...moreSections,
    ];
    return (
      <nav className="shell-sectionTabs shell-sectionTabs--compact" aria-label={t("shell.opsRoomDomains")}>
        <SpaceSectionMoreMenu
          open={moreOpen}
          onOpenChange={setMoreOpen}
          sections={sheetSections}
          triggerLabel={`بخش: ${currentLabel}`}
          triggerHighlighted={!homeActive}
          presentation="sheet"
          isHrefActive={isHrefActive}
          ariaLabel={`بخش: ${currentLabel}`}
        />
      </nav>
    );
  }

  return (
    <nav className="shell-sectionTabs shell-sectionTabs--compact" aria-label={t("shell.opsRoomDomains")}>
      <Link
        href={wPath(slug)}
        className={`shell-sectionTabs__tab shell-sectionTabs__tab--section${homeActive ? " is-active" : ""}`}
        aria-current={homeActive ? "page" : undefined}
      >
        {OVERVIEW_SECTION_LABEL}
      </Link>
      {showReportsCharts ? (
        <Link
          href={reportsChartsHref(slug, flags)}
          className={`shell-sectionTabs__tab shell-sectionTabs__tab--section${reportsActive ? " is-active" : ""}`}
          aria-current={reportsActive ? "page" : undefined}
          data-section="reports-charts"
        >
          {REPORTS_CHARTS_SECTION_LABEL}
        </Link>
      ) : null}
      {primaryItems.map((item) => {
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
      <SpaceSectionMoreMenu
        open={moreOpen}
        onOpenChange={setMoreOpen}
        sections={moreSections}
        triggerLabel={moreTriggerLabel}
        triggerHighlighted={moreActive}
        presentation="dropdown"
        isHrefActive={isHrefActive}
        ariaLabel={moreActiveItem ? `بیشتر: ${moreActiveItem.label}` : "بیشتر"}
      />
    </nav>
  );
}
