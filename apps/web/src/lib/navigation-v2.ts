import type { WorkspaceTemplate } from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { modulesForTemplate } from "@/lib/workspace-modules";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";
import type { ShellIcon } from "@/components/app-shell";

export type NavItemV2 = {
  key: string;
  label: string;
  href: string;
  icon: ShellIcon;
  /** Module gate — if set, only shown when template includes this module. */
  module?: string;
};

export type NavSectionV2 = {
  key: string;
  label: string;
  items: NavItemV2[];
};

export type BottomTabV2 = {
  key: "home" | "expenses" | "space" | "more";
  label: string;
  href: string;
  icon: ShellIcon;
};

function scoped(slug: string | null, page: WorkspacePage, hubFallback: string): string {
  return slug ? wPath(slug, page) : hubFallback;
}

/** Account-level destinations — no tab duplicates (حساب/فضا) and no spaces list
 * (workspace switcher + تب «فضا» همان کار را می‌کنند). */
export function accountNav(): NavItemV2[] {
  return [
    {
      key: "security",
      label: NAV_LABELS.security,
      href: "/account/security",
      icon: "settings",
    },
    {
      key: "whats-new",
      label: NAV_LABELS.whatsNew,
      href: "/whats-new",
      icon: "receipt",
    },
  ];
}

/** @deprecated Use accountNav() */
export const ACCOUNT_NAV = accountNav();

/**
 * Sidebar sections for the active workspace, filtered by template modules.
 * Prefers `/w/[slug]/…` when slug is known; otherwise hub fallbacks.
 * Does not repeat tab destinations (خانه / فضا / حساب).
 */
export function spaceNav(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
): NavSectionV2[] {
  const modules = modulesForTemplate(template);
  const has = (mod: string) => modules.has(mod);

  const financeItems: NavItemV2[] = (
    [
      // «خرج‌ها» در تب پایین/هدر است — اینجا تکرار نمی‌شود.
      {
        key: "settlements",
        label: NAV_LABELS.settlements,
        href: scoped(slug, "settlements", `${hubPathFor("/workspaces")}#settlement-panel`),
        icon: "wallet" as const,
        module: "settlements",
      },
      {
        key: "ledger",
        label: NAV_LABELS.ledger,
        href: scoped(slug, "ledger", hubPathFor("/daily-ledger")),
        icon: "receipt" as const,
        module: "expenses",
      },
    ] satisfies Array<NavItemV2 & { module?: string }>
  ).filter((item) => {
    if (!item.module) return true;
    if (item.module === "settlements") return has("settlements") || has("expenses");
    return has(item.module);
  });

  const buyItems: NavItemV2[] = (
    [
      {
        key: "procurement",
        label: NAV_LABELS.procurement,
        href: scoped(slug, "procurement", hubPathFor("/workspaces/procurement")),
        icon: "cart" as const,
        module: "procurement",
      },
      {
        key: "proposals",
        label: NAV_LABELS.proposals,
        href: scoped(slug, "proposals", hubPathFor("/proposals")),
        icon: "cart" as const,
        module: "proposals",
      },
      {
        key: "assets",
        label: NAV_LABELS.assets,
        href: scoped(slug, "assets", hubPathFor("/workspaces/assets")),
        icon: "box" as const,
        module: "assets",
      },
    ] satisfies Array<NavItemV2 & { module?: string }>
  ).filter((item) => {
    if (!item.module) return true;
    if (item.module === "assets") return has("assets") || has("assets_light");
    return has(item.module);
  });

  const spaceItems: NavItemV2[] = (
    [
      {
        key: "invite",
        label: NAV_LABELS.invite,
        href: scoped(slug, "members", hubPathFor("/workspaces/invite")),
        icon: "partners" as const,
        module: "invites",
      },
      {
        key: "partners",
        label: NAV_LABELS.partners,
        href: scoped(slug, "partners", hubPathFor("/workspaces/partnership")),
        icon: "partners" as const,
        module: "partnerships",
      },
      {
        key: "settings",
        label: "تنظیمات فضا",
        href: scoped(slug, "settings", "/spaces"),
        icon: "settings" as const,
      },
    ] satisfies Array<NavItemV2 & { module?: string }>
  ).filter((item) => !item.module || has(item.module));

  const sections: NavSectionV2[] = [];
  if (financeItems.length) {
    sections.push({ key: "finance", label: NAV_LABELS.sectionFinance, items: financeItems });
  }
  if (buyItems.length) {
    sections.push({ key: "buy", label: NAV_LABELS.sectionBuy, items: buyItems });
  }
  if (spaceItems.length) {
    sections.push({ key: "space", label: NAV_LABELS.sectionSpace, items: spaceItems });
  }
  return sections;
}

/** Mobile/desktop primary tabs — fixed four concepts. */
export function bottomTabsV2(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
): BottomTabV2[] {
  const modules = modulesForTemplate(template);
  const kind = spaceKindForTemplate(template);
  const expensesHref = modules.has("expenses")
    ? scoped(slug, "expenses", hubPathFor("/workspaces"))
    : scoped(slug, "home", hubPathFor("/overview"));

  return [
    {
      key: "home",
      label: NAV_LABELS.home,
      href: slug ? wPath(slug) : "/hub",
      icon: "home",
    },
    { key: "expenses", label: NAV_LABELS.expenses, href: expensesHref, icon: "wallet" },
    {
      key: "space",
      label: spaceTabLabel(kind),
      href: scoped(
        slug,
        "space",
        hubPathFor(kind === "org" ? "/orgs" : kind === "personal" ? "/me" : "/group"),
      ),
      icon: kind === "org" ? "box" : "partners",
    },
    {
      key: "more",
      label: NAV_LABELS.more,
      href: scoped(slug, "more", "/account"),
      icon: "settings",
    },
  ] satisfies BottomTabV2[];
}

export function expenseFabHref(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
): string | null {
  const modules = modulesForTemplate(template);
  if (!modules.has("expenses")) return null;
  return `${scoped(slug, "expenses", hubPathFor("/workspaces"))}#quick-expense`;
}

export function isNavHrefActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0] ?? href;
  if (base === "/hub" || /^\/w\/[^/]+$/.test(base)) {
    return pathname === base || pathname === `${base}/`;
  }
  if (base === "/account") {
    return pathname === "/account" || pathname.startsWith("/account/");
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}
