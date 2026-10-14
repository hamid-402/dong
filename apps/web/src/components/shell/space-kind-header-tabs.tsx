"use client";

import Link from "next/link";
import {
  type MembershipRole,
  type SpaceKind,
  type WorkspaceTemplate,
} from "@dang/contracts";
import {
  homeDomainHref,
  parseDomainGroup,
  spaceNav,
  spaceNavItemHint,
  type SpaceNavFlags,
} from "@/lib/navigation-v2";
import { OVERVIEW_SECTION_LABEL } from "@/components/shell/shell-location";
import { classicPathToWorkspacePage, wPath } from "@/lib/workspace-paths";
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
