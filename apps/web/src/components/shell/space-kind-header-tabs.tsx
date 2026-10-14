"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, type KeyboardEvent } from "react";
import {
  spaceKindForTemplate,
  type MembershipRole,
  type SpaceKind,
  type WorkspaceSummary,
  type WorkspaceTemplate,
} from "@dang/contracts";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import {
  homeDomainHref,
  parseDomainGroup,
  spaceNav,
  spaceNavItemHint,
  type SpaceNavFlags,
} from "@/lib/navigation-v2";
import { OVERVIEW_SECTION_LABEL } from "@/components/shell/shell-location";
import { classicPathToWorkspacePage, spacesListHref, wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";

type KindTab = {
  key: "home" | SpaceKind;
  label: string;
  href: string;
};

export type KindTabVisualState = "idle" | "list-active" | "current-realm";

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
      href: spacesListHref("personal"),
    },
    {
      key: "group",
      label: NAV_LABELS.spaceGroup,
      href: spacesListHref("group"),
    },
    {
      key: "building",
      label: NAV_LABELS.spaceBuilding,
      href: spacesListHref("building"),
    },
    {
      key: "org",
      label: NAV_LABELS.spaceOrg,
      href: spacesListHref("org"),
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

/** Header order: شخصی، گروهی، سازمان، ساختمان. */
export const KIND_SWITCH_ORDER = ["personal", "group", "org", "building"] as const;

type KindSwitchWorkspace = {
  slug: string;
  template: WorkspaceTemplate;
};

/** Kind list, or the only personal space when there is exactly one. */
export function kindSwitcherHref(
  kind: SpaceKind,
  workspaces: readonly KindSwitchWorkspace[],
): string {
  if (kind === "personal") {
    const personal = workspaces.filter(
      (ws) => spaceKindForTemplate(ws.template) === "personal",
    );
    if (personal.length === 1 && personal[0]) return wPath(personal[0].slug);
  }
  return spacesListHref(kind);
}

/**
 * Four-kind switcher beside the wordmark.
 * Segments on desktop/tablet; a native select from 480px down (shell.css).
 * The active kind comes from resolveShellLocation.
 */
export function KindHeaderSwitcher({
  activeKind,
  workspaces,
}: {
  activeKind: SpaceKind | null;
  workspaces: readonly KindSwitchWorkspace[];
}) {
  const router = useRouter();
  const selectId = useId();
  const options = KIND_SWITCH_ORDER.map((kind) => ({
    kind,
    label: spaceTabLabel(kind),
    href: kindSwitcherHref(kind, workspaces),
  }));

  function onSegmentsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLAnchorElement>("[data-kind-option]"),
    );
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (current < 0 || items.length === 0) return;
    let next = current;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (current - 1 + items.length) % items.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (current + 1) % items.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = items.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  const tabStop =
    options.find((option) => option.kind === activeKind)?.kind ?? options[0]?.kind;

  return (
    <nav className="kindSwitcher" aria-label={t("shell.kindTabsAria")}>
      <div className="kindSwitcher__segments" onKeyDown={onSegmentsKeyDown}>
        {options.map((option) => {
          const active = option.kind === activeKind;
          return (
            <Link
              key={option.kind}
              href={option.href}
              data-kind={option.kind}
              data-kind-option=""
              aria-current={active ? "true" : undefined}
              tabIndex={option.kind === tabStop ? 0 : -1}
              className={`kindSwitcher__seg${active ? " is-active" : ""}`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      <div className="kindSwitcher__dropdown">
        <label className="visually-hidden" htmlFor={selectId}>
          {t("shell.kindTabsAria")}
        </label>
        <select
          id={selectId}
          className="kindSwitcher__select"
          value={activeKind ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            if (
              next !== "personal" &&
              next !== "group" &&
              next !== "org" &&
              next !== "building"
            ) {
              return;
            }
            router.push(kindSwitcherHref(next, workspaces));
          }}
        >
          <option value="" disabled>
            نوع فضا
          </option>
          {options.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}

/**
 * Inside a space: domain tabs, then that section’s links, on one scrolling line.
 * The catalog shortcut stays beside this row. Leave stays on the space switcher.
 * The first tab is always the space overview («خلاصه»).
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
        {OVERVIEW_SECTION_LABEL}
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
