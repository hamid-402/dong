import type { ProductFeatureFlags, WorkspaceTemplate } from "@dang/contracts";
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

export type ContextualMosaicIntent =
  | "record"
  | "decide"
  | "monitor"
  | "manage";

export type ContextualMosaicItem = NavItemV2 & {
  summary: string;
  intent: ContextualMosaicIntent;
};

export type ContextualMosaicSection = Omit<NavSectionV2, "items"> & {
  items: ContextualMosaicItem[];
};

export type BottomTabV2 = {
  key: "home" | "expenses" | "space" | "more";
  label: string;
  href: string;
  icon: ShellIcon;
};

/** Product-flag gates for More / palette — hide when off (no dead tiles). */
export type SpaceNavFlags = Partial<
  Pick<
    ProductFeatureFlags,
    | "addonAck"
    | "approvalQueue"
    | "costCenter"
    | "allowance"
    | "reimbursement"
    | "categoryBudget"
    | "expenseImport"
    | "expensePolicy"
    | "workspacePlans"
    | "planAdmin"
    | "fxRates"
  >
>;

function scoped(slug: string | null, page: WorkspacePage, hubFallback: string): string {
  return slug ? wPath(slug, page) : hubFallback;
}

function orgFinanceLive(flags?: SpaceNavFlags): boolean {
  return Boolean(
    flags?.costCenter ||
      flags?.allowance ||
      flags?.reimbursement ||
      flags?.categoryBudget ||
      flags?.expenseImport ||
      flags?.expensePolicy ||
      flags?.workspacePlans ||
      flags?.planAdmin ||
      flags?.fxRates,
  );
}

const CONTEXTUAL_MOSAIC_META: Readonly<
  Record<string, Pick<ContextualMosaicItem, "summary" | "intent">>
> = {
  expenses: {
    summary: "ثبت، جستجو و پیگیری خرج‌های جمعی، خصوصی و شرکتی",
    intent: "record",
  },
  settlements: {
    summary: "مانده اعضا، ادعاهای باز، اختلاف و تسویه بدهی",
    intent: "decide",
  },
  invoices: {
    summary: "دوره‌های مالی، صدور صورتحساب و پیگیری اختلاف",
    intent: "monitor",
  },
  recurring: {
    summary: "قواعد دوره‌ای، دسته‌بندی و گزارش بازه‌ای",
    intent: "manage",
  },
  addons: {
    summary: "هزینه افزوده برای عضو هدف و وضعیت تأیید دریافت",
    intent: "decide",
  },
  approvals: {
    summary: "صف یکپارچه تصمیم‌های خرج، صورتحساب و اضافه شخصی",
    intent: "decide",
  },
  "org-finance": {
    summary: "مرکز هزینه، سقف، بودجه، سیاست، بازپرداخت و نرخ ارز",
    intent: "monitor",
  },
  ledger: {
    summary: "دفتر روزانه، قلم‌ها، تعطیلی، خروجی و پیشنهاد تسویه",
    intent: "record",
  },
  procurement: {
    summary: "نیاز، درخواست خرید، فروشنده، سفارش و تحویل",
    intent: "record",
  },
  proposals: {
    summary: "پیشنهاد، رأی، حدنصاب و انتقال تصمیم به خرید",
    intent: "decide",
  },
  assets: {
    summary: "دارایی، تخصیص، انتقال، تحویل و ثبت خرابی",
    intent: "manage",
  },
  invite: {
    summary: "اعضا، نقش‌ها، سهم‌ها و دعوت امن به فضای کاری",
    intent: "manage",
  },
  partners: {
    summary: "قرارداد، آورده، قرض، مالکیت و قفل دوره",
    intent: "monitor",
  },
  settings: {
    summary: "مشخصات، واحد نمایش، الگو و تنظیمات فضای کاری",
    intent: "manage",
  },
  audit: {
    summary: "رخدادهای واقعی، نتیجه عملیات، عامل اجرا و فراداده ثبت‌شده",
    intent: "monitor",
  },
  metrics: {
    summary: "قیف محصول از رویدادهای audit واقعی همین فضا",
    intent: "monitor",
  },
  security: {
    summary: "رمز عبور، نشست‌های فعال و تأیید دومرحله‌ای",
    intent: "manage",
  },
  "whats-new": {
    summary: "قابلیت‌های تحویل‌شده و تغییرات واقعی محصول",
    intent: "monitor",
  },
  profile: {
    summary: "مشخصات حساب، زبان، منطقه زمانی و خروج امن",
    intent: "manage",
  },
};

function contextualItem(item: NavItemV2): ContextualMosaicItem {
  const metadata = CONTEXTUAL_MOSAIC_META[item.key] ?? {
    summary: "دسترسی به ابزارهای مجاز این فضای کاری",
    intent: "manage" as const,
  };
  return { ...item, ...metadata };
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
 * Flagged items are omitted when the product flag is off (honest discoverability).
 */
export function spaceNav(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
  flags?: SpaceNavFlags,
): NavSectionV2[] {
  const modules = modulesForTemplate(template);
  const has = (mod: string) => modules.has(mod);
  const kind = spaceKindForTemplate(template);

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
        key: "invoices",
        label: NAV_LABELS.invoices,
        href: scoped(slug, "invoices", `${hubPathFor("/workspaces")}#period-invoice-panel`),
        icon: "receipt" as const,
        module: "expenses",
      },
      {
        key: "recurring",
        label: NAV_LABELS.recurring,
        href: scoped(slug, "recurring", `${hubPathFor("/workspaces")}#reports-panel`),
        icon: "receipt" as const,
        module: "expenses",
      },
      ...(flags?.addonAck
        ? [
            {
              key: "addons",
              label: NAV_LABELS.addons,
              href: scoped(slug, "addons", hubPathFor("/group")),
              icon: "wallet" as const,
              module: "expenses",
            },
          ]
        : []),
      ...(flags?.approvalQueue
        ? [
            {
              key: "approvals",
              label: NAV_LABELS.approvals,
              href: scoped(slug, "approvals", hubPathFor("/workspaces")),
              icon: "receipt" as const,
              module: "expenses",
            },
          ]
        : []),
      ...(kind === "org" && orgFinanceLive(flags)
        ? [
            {
              key: "org-finance",
              label: NAV_LABELS.orgFinance,
              href: scoped(slug, "orgFinance", hubPathFor("/orgs")),
              icon: "wallet" as const,
              module: "expenses",
            },
          ]
        : []),
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
        key: "audit",
        label: NAV_LABELS.audit,
        href: scoped(slug, "audit", "/spaces"),
        icon: "receipt" as const,
      },
      {
        key: "metrics",
        label: NAV_LABELS.metrics,
        href: scoped(slug, "metrics", "/spaces"),
        icon: "receipt" as const,
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

/**
 * Contextual mosaic destinations use the exact same module/flag-filtered tree as
 * shell navigation. The home variant is a concise mission launcher (max eight);
 * the all variant preserves every available destination in section order.
 */
export function contextualMosaicSections(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
  flags?: SpaceNavFlags,
  variant: "home" | "all" = "all",
): ContextualMosaicSection[] {
  const sections = spaceNav(template, slug, flags);
  if (variant === "all") {
    return sections.map((section) => ({
      ...section,
      items: section.items.map(contextualItem),
    }));
  }

  const modules = modulesForTemplate(template);
  const allItems = sections.flatMap((section) => section.items);
  const byKey = new Map(allItems.map((item) => [item.key, item]));
  const missions: NavItemV2[] = [];

  if (modules.has("expenses")) {
    missions.push({
      key: "expenses",
      label: NAV_LABELS.expenses,
      href: scoped(slug, "expenses", hubPathFor("/workspaces")),
      icon: "wallet",
      module: "expenses",
    });
  }

  for (const key of [
    "approvals",
    "settlements",
    "procurement",
    "proposals",
    "ledger",
    "assets",
    "invite",
    "partners",
  ]) {
    const item = byKey.get(key);
    if (item) missions.push(item);
  }

  return missions.length
    ? [
        {
          key: "missions",
          label: "ماموریت‌های این فضا",
          items: missions.slice(0, 8).map(contextualItem),
        },
      ]
    : [];
}

export function contextualAccountNav(): ContextualMosaicItem[] {
  return [
    contextualItem({
      key: "profile",
      label: NAV_LABELS.profile,
      href: "/account",
      icon: "settings",
    }),
    ...accountNav().map(contextualItem),
  ];
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
