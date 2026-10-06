import type { ProductFeatureFlags, WorkspaceTemplate } from "@dang/contracts";
import {
  isExpenseApproverRole,
  roleAllowsNavKey,
  spaceKindForTemplate,
} from "@dang/contracts";
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";
import { modulesForTemplate } from "@/lib/workspace-modules";
import { canViewJobsDlq, canViewProductMetrics } from "@/lib/workspace-page-access";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";
import { ROUTE_GEM } from "@/lib/tile-gem-palettes";
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
  /** Gem palette key for mosaic tile color coding. */
  gemKey?: string;
};

export type ContextualMosaicSection = Omit<NavSectionV2, "items"> & {
  items: ContextualMosaicItem[];
  /** Optional one-line hint under the section title (subgroup layers). */
  description?: string;
};

export type BottomTabV2 = {
  key: "home" | "spaces" | "expenses" | "space" | "more";
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
> & {
  /** From capabilities.providers.jobs === redis_queue | inline_stub */
  jobsAvailable?: boolean;
  /** From capabilities.providers.jobs === redis_queue */
  jobsRedisQueue?: boolean;
  /** From capabilities.providers.catalog === catalog_v1 */
  catalogV1?: boolean;
  /** From capabilities.providers.statements === csv_json_print_v1 */
  statementsV1?: boolean;
  /** From capabilities.providers.charts === charts_v1 */
  chartsV1?: boolean;
  /** From capabilities.providers.paymentReceipts === manual_review_v1 */
  paymentReceiptsV1?: boolean;
  /** From capabilities.providers.accessPolicy === rbac_abac_grants_v1 */
  accessPolicyGrants?: boolean;
  /** antifraud heuristics or maker-checker ≠ off */
  securityOpsV1?: boolean;
};

export function spaceNavItemHint(key: string): string | undefined {
  return CONTEXTUAL_MOSAIC_META[key]?.summary;
}

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
  "personal-finance": {
    summary: "دفتر و بودجهٔ شخصی جدا از فضای گروهی",
    intent: "manage",
  },
  settlements: {
    summary: "مانده اعضا، ادعاهای باز، اختلاف و تسویه بدهی",
    intent: "decide",
  },
  invoices: {
    summary: "صورتحساب کلی دوره مالی و پیگیری اختلاف",
    intent: "monitor",
  },
  statements: {
    summary: "ریز حساب قلم‌به‌قلم اعضا، بازه زمانی و دانلود CSV/JSON",
    intent: "monitor",
  },
  payments: {
    summary: "رسید پرداخت، بررسی دستی و پرداخت به‌جای عضو",
    intent: "record",
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
  catalog: {
    summary: "کالا، خدمت، وعده و تنقلات با واحد و قیمت مرجع",
    intent: "manage",
  },
  invite: {
    summary: "اعضا، نقش‌ها، سهم‌ها و دعوت امن به فضای کاری",
    intent: "manage",
  },
  members: {
    summary: "فهرست اعضا، افزودن عضو، تغییر نقش و دعوت",
    intent: "manage",
  },
  permissions: {
    summary: "نقش‌ها و اعطای دسترسی همین فضا",
    intent: "manage",
  },
  subunits: {
    summary: "واحدهای ساختمان یا بخش‌ها و شرکت‌های زیرمجموعه با اعضای هر کدام",
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
  "security-ops": {
    summary: "رویداد امنیتی، ضدتقلب و چهارچشم همین فضا",
    intent: "monitor",
  },
  metrics: {
    summary: "قیف محصول از رویدادهای audit واقعی همین فضا",
    intent: "monitor",
  },
  charts: {
    summary: "روند خرج، سهم اعضا، دسته و مانده از دادهٔ واقعی",
    intent: "monitor",
  },
  jobs: {
    summary: "صف Redis، نامهٔ مرده و بازپخش کار ناموفق همین فضا",
    intent: "monitor",
  },
  security: {
    summary: "رمز عبور، نشست‌های فعال و تأیید دومرحله‌ای",
    intent: "manage",
  },
  admin: {
    summary: "کنسول سامانه، break-glass، رویداد امنیتی و SLO — فقط نقش platform",
    intent: "monitor",
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

const INTENT_GEM: Record<ContextualMosaicIntent, string> = {
  record: "teal",
  decide: "amber",
  monitor: "blue",
  manage: "violet",
};

export const MOSAIC_INTENT_ORDER: ContextualMosaicIntent[] = [
  "decide",
  "record",
  "monitor",
  "manage",
];

export const MOSAIC_INTENT_LABEL: Record<ContextualMosaicIntent, string> = {
  get decide() {
    return t("shell.intentDecide");
  },
  get record() {
    return t("shell.intentRecord");
  },
  get monitor() {
    return t("shell.intentMonitor");
  },
  get manage() {
    return t("shell.intentManage");
  },
};

export const MOSAIC_INTENT_GEM = INTENT_GEM;

export function parseMosaicIntent(
  raw: string | null | undefined,
): ContextualMosaicIntent | null {
  if (raw === "decide" || raw === "record" || raw === "monitor" || raw === "manage") {
    return raw;
  }
  return null;
}

const INTENT_SECTION_ORDER = MOSAIC_INTENT_ORDER;
const INTENT_SECTION_LABEL = MOSAIC_INTENT_LABEL;

function contextualItem(item: NavItemV2): ContextualMosaicItem {
  const metadata = CONTEXTUAL_MOSAIC_META[item.key] ?? {
    summary: "دسترسی به ابزارهای مجاز این فضای کاری",
    intent: "manage" as const,
  };
  return {
    ...item,
    ...metadata,
    gemKey: ROUTE_GEM[item.key] ?? INTENT_GEM[metadata.intent],
  };
}

/** Summary text for command-palette / search haystacks (same copy as mosaic tiles). */
export function mosaicItemSummary(key: string): string | undefined {
  return CONTEXTUAL_MOSAIC_META[key]?.summary;
}

/** Regroup flat tools by intent so More reads as purposeful workstreams. */
export function groupMosaicByIntent(
  items: ContextualMosaicItem[],
): ContextualMosaicSection[] {
  const buckets = new Map<ContextualMosaicIntent, ContextualMosaicItem[]>();
  for (const intent of INTENT_SECTION_ORDER) buckets.set(intent, []);
  for (const item of items) {
    const list = buckets.get(item.intent) ?? [];
    list.push(item);
    buckets.set(item.intent, list);
  }
  return INTENT_SECTION_ORDER.flatMap((intent) => {
    const sectionItems = buckets.get(intent) ?? [];
    if (sectionItems.length === 0) return [];
    return [
      {
        key: `intent-${intent}`,
        label: INTENT_SECTION_LABEL[intent],
        items: sectionItems,
      },
    ];
  });
}

export type AccountNavOptions = {
  /** capabilities.providers.platformAdmin === "platform_v1" */
  platformAdminLive?: boolean;
  /** From /auth/me — only platform_owner / platform_support see console. */
  platformRole?: string | null;
};

function isPlatformConsoleRole(role: string | null | undefined): boolean {
  return role === "platform_owner" || role === "platform_support";
}

/** Account-level destinations — no tab duplicates (حساب/فضا) and no spaces list
 * (workspace switcher + تب «فضا» همان کار را می‌کنند). */
export function accountNav(options: AccountNavOptions = {}): NavItemV2[] {
  const items: NavItemV2[] = [
    {
      key: "friends",
      label: NAV_LABELS.friends,
      href: "/account/friends",
      icon: "partners",
    },
    {
      key: "privacy",
      label: NAV_LABELS.privacy,
      href: "/account/privacy",
      icon: "settings",
    },
    {
      key: "personal-finance",
      label: NAV_LABELS.personalFinance,
      href: "/me/finance",
      icon: "wallet",
    },
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
  if (
    options.platformAdminLive === true &&
    isPlatformConsoleRole(options.platformRole)
  ) {
    items.push({
      key: "admin",
      label: NAV_LABELS.admin,
      href: "/admin",
      icon: "settings",
    });
  }
  return items;
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
  role?: string | null,
): NavSectionV2[] {
  const modules = modulesForTemplate(template);
  const has = (mod: string) => modules.has(mod);
  const kind = spaceKindForTemplate(template);

  const financeItems: NavItemV2[] = (
    [
      // ثبت خرج برای همهٔ kindها (شخصی هم دفتر خرج دارد).
      ...(has("expenses")
        ? [
            {
              key: "expenses",
              label: NAV_LABELS.expenses,
              href: scoped(slug, "expenses", hubPathFor("/workspaces")),
              icon: "receipt" as const,
              module: "expenses" as const,
            },
          ]
        : []),
      ...(kind === "personal"
        ? [
            {
              key: "personal-finance",
              label: NAV_LABELS.personalFinance,
              href: "/me/finance",
              icon: "wallet" as const,
            },
          ]
        : []),
      // ترتیب: روزمره → اسناد/گزارش → سازمانی
      {
        key: "settlements",
        label: NAV_LABELS.settlements,
        href: scoped(slug, "settlements", `${hubPathFor("/workspaces")}#settlement-panel`),
        icon: "wallet" as const,
        module: "settlements",
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
      {
        key: "recurring",
        label: NAV_LABELS.recurring,
        href: scoped(slug, "recurring", `${hubPathFor("/workspaces")}#reports-panel`),
        icon: "receipt" as const,
        module: "expenses",
      },
      ...(flags?.approvalQueue &&
      (role == null || role === "" || isExpenseApproverRole(role))
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
      {
        key: "invoices",
        label: NAV_LABELS.invoices,
        href: scoped(slug, "invoices", `${hubPathFor("/workspaces")}#period-invoice-panel`),
        icon: "receipt" as const,
        module: "expenses",
      },
      ...(flags?.statementsV1
        ? [
            {
              key: "statements",
              label: NAV_LABELS.statements,
              href: scoped(slug, "statements", "/w"),
              icon: "receipt" as const,
              module: "expenses",
            },
          ]
        : []),
      ...(flags?.paymentReceiptsV1
        ? [
            {
              key: "payments",
              label: NAV_LABELS.payments,
              href: scoped(slug, "payments", "/w"),
              icon: "wallet" as const,
              module: "settlements",
            },
          ]
        : []),
      ...(kind !== "personal"
        ? [
            {
              key: "ledger",
              label: NAV_LABELS.ledger,
              href: scoped(slug, "ledger", hubPathFor("/daily-ledger")),
              icon: "receipt" as const,
              module: "expenses",
            },
          ]
        : []),
      ...(flags?.chartsV1
        ? [
            {
              key: "charts",
              label: NAV_LABELS.charts,
              href: scoped(slug, "charts", "/home"),
              icon: "receipt" as const,
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
    ] satisfies Array<NavItemV2 & { module?: string }>
  ).filter((item) => {
    if (!item.module) return true;
    if (item.module === "settlements") return has("settlements") || has("expenses");
    return has(item.module);
  });

  const buyItems: NavItemV2[] = (
    [
      ...(flags?.catalogV1 && kind !== "personal" && has("expenses")
        ? [
            {
              key: "catalog",
              label: NAV_LABELS.catalog,
              href: scoped(slug, "catalog", "/w"),
              icon: "cart" as const,
              module: "expenses",
            },
          ]
        : []),
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
    if (item.module === "expenses") return has("expenses") && kind !== "personal";
    return has(item.module);
  });

  const peopleItems: NavItemV2[] = (
    [
      {
        key: "members",
        label: NAV_LABELS.members,
        href: scoped(slug, "members", hubPathFor("/workspaces/invite")),
        icon: "partners" as const,
        module: "invites",
      },
      ...(kind === "building" || kind === "org"
        ? [
            {
              key: "subunits",
              label: NAV_LABELS.subunits,
              href: scoped(slug, "subunits", "/home"),
              icon: "box" as const,
            },
          ]
        : []),
      ...(flags?.accessPolicyGrants
        ? [
            {
              key: "permissions",
              label: NAV_LABELS.permissions,
              href: scoped(slug, "permissions", "/home"),
              icon: "settings" as const,
            },
          ]
        : []),
      {
        key: "partners",
        label: NAV_LABELS.partners,
        href: scoped(slug, "partners", hubPathFor("/workspaces/partnership")),
        icon: "partners" as const,
        module: "partnerships",
      },
    ] satisfies Array<NavItemV2 & { module?: string }>
  ).filter((item) => !item.module || has(item.module));

  const oversightItems: NavItemV2[] = (
    [
      {
        key: "audit",
        label: NAV_LABELS.audit,
        href: scoped(slug, "audit", "/home"),
        icon: "receipt" as const,
      },
      ...(flags?.securityOpsV1
        ? [
            {
              key: "security-ops",
              label: NAV_LABELS.securityOps,
              href: scoped(slug, "securityOps", "/home"),
              icon: "settings" as const,
            },
          ]
        : []),
      ...(canViewProductMetrics(role)
        ? [
            {
              key: "metrics",
              label: NAV_LABELS.metrics,
              href: scoped(slug, "metrics", "/home"),
              icon: "receipt" as const,
            },
          ]
        : []),
      ...((flags?.jobsAvailable || flags?.jobsRedisQueue) && canViewJobsDlq(role)
        ? [
            {
              key: "jobs",
              label: NAV_LABELS.jobs,
              href: scoped(slug, "jobs", "/home"),
              icon: "receipt" as const,
            },
          ]
        : []),
    ] as Array<NavItemV2 & { module?: string }>
  ).filter((item) => !item.module || has(item.module));

  const settingsItems: NavItemV2[] = [
    {
      key: "settings",
      label: NAV_LABELS.settings,
      href: scoped(slug, "settings", "/home"),
      icon: "settings" as const,
    },
  ];

  const sections: NavSectionV2[] = [];
  if (financeItems.length) {
    sections.push({ key: "finance", label: NAV_LABELS.sectionFinance, items: financeItems });
  }
  if (buyItems.length) {
    sections.push({ key: "buy", label: NAV_LABELS.sectionBuy, items: buyItems });
  }
  if (peopleItems.length) {
    sections.push({ key: "people", label: NAV_LABELS.sectionPeople, items: peopleItems });
  }
  if (oversightItems.length) {
    sections.push({
      key: "oversight",
      label: NAV_LABELS.sectionOversight,
      items: oversightItems,
    });
  }
  if (settingsItems.length) {
    sections.push({
      key: "settings",
      label: NAV_LABELS.sectionSettings,
      items: settingsItems,
    });
  }
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => roleAllowsNavKey(role, item.key)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Domain-grouped mosaic — same gate tree as spaceNav (single mental map for
 * Tools / palette / home catalog). Intent remains on each tile via gemKey.
 */
export function domainGroupedNav(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
  flags?: SpaceNavFlags,
  role?: string | null,
): ContextualMosaicSection[] {
  return spaceNav(template, slug, flags, role).map((section) => ({
    key: section.key,
    label: section.label,
    items: section.items.map(contextualItem),
  }));
}

export type HomeMissionSignals = {
  pendingApprovals?: number;
  openSettlements?: number;
  openNeeds?: number;
  /**
   * @deprecated Kept for call-site compatibility. Home mosaic order is stable;
   * empty guidance belongs in overview suggested-tasks, not a swapped mosaic.
   */
  isEmptyWorkspace?: boolean;
};

/**
 * Contextual mosaic destinations use the exact same module/flag-filtered tree as
 * shell navigation. Home and Tools share domain folders; subgroups use `?group=`.
 * Urgency is card facts only — never layout swaps.
 */
export function contextualMosaicSections(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
  flags?: SpaceNavFlags,
  variant: "home" | "all" = "all",
  role?: string | null,
  _signals?: HomeMissionSignals,
): ContextualMosaicSection[] {
  void variant;
  void _signals;
  return domainGroupedNav(template, slug, flags, role);
}

export type DomainGroupKey = "finance" | "buy" | "people" | "oversight" | "settings";

export const DOMAIN_GROUP_ORDER: DomainGroupKey[] = [
  "finance",
  "buy",
  "people",
  "oversight",
  "settings",
];

export const DOMAIN_GROUP_GEM: Record<DomainGroupKey, string> = {
  finance: "amber",
  buy: "teal",
  people: "violet",
  oversight: "blue",
  settings: "slate",
};

export function parseDomainGroup(
  raw: string | null | undefined,
): DomainGroupKey | null {
  if (
    raw === "finance" ||
    raw === "buy" ||
    raw === "people" ||
    raw === "oversight" ||
    raw === "settings"
  ) {
    return raw;
  }
  return null;
}

export type DomainFolderBase = "home" | "more";

export function domainGroupLabel(domain: DomainGroupKey): string {
  switch (domain) {
    case "finance":
      return NAV_LABELS.sectionFinance;
    case "buy":
      return NAV_LABELS.sectionBuy;
    case "people":
      return NAV_LABELS.sectionPeople;
    case "oversight":
      return NAV_LABELS.sectionOversight;
    case "settings":
      return NAV_LABELS.sectionSettings;
  }
}

export function domainGroupHint(domain: DomainGroupKey): string {
  switch (domain) {
    case "finance":
      return t("shell.domainFinanceHint");
    case "buy":
      return t("shell.domainBuyHint");
    case "people":
      return t("shell.domainPeopleHint");
    case "oversight":
      return t("shell.domainOversightHint");
    case "settings":
      return t("shell.domainSettingsHint");
  }
}

/** Domain subgroup keys — URL `?group=` when a domain has more than one pack. */
export type FinanceSubGroup =
  | "everyday"
  | "schedule"
  | "records"
  | "insights"
  | "organizational";

export type BuySubGroup = "source" | "holdings";
export type PeopleSubGroup = "membership" | "access" | "network";
export type OversightSubGroup = "compliance" | "operations";
export type DomainSubGroupKey =
  | FinanceSubGroup
  | BuySubGroup
  | PeopleSubGroup
  | OversightSubGroup;

type SubgroupPack = {
  key: DomainSubGroupKey;
  label: string;
  hint: string;
  icon: ShellIcon;
  gemKey: string;
  items: ContextualMosaicItem[];
};

const FINANCE_SUBGROUP: Record<string, FinanceSubGroup> = {
  expenses: "everyday",
  settlements: "everyday",
  addons: "everyday",
  approvals: "everyday",
  recurring: "schedule",
  invoices: "records",
  statements: "records",
  payments: "records",
  ledger: "records",
  charts: "insights",
  "org-finance": "organizational",
};

const FINANCE_SUBGROUP_ORDER: FinanceSubGroup[] = [
  "everyday",
  "schedule",
  "records",
  "insights",
  "organizational",
];

const BUY_SUBGROUP: Record<string, BuySubGroup> = {
  catalog: "source",
  procurement: "source",
  proposals: "source",
  assets: "holdings",
};

const BUY_SUBGROUP_ORDER: BuySubGroup[] = ["source", "holdings"];

const PEOPLE_SUBGROUP: Record<string, PeopleSubGroup> = {
  members: "membership",
  subunits: "membership",
  invite: "membership",
  permissions: "access",
  partners: "network",
};

const PEOPLE_SUBGROUP_ORDER: PeopleSubGroup[] = ["membership", "access", "network"];

const OVERSIGHT_SUBGROUP: Record<string, OversightSubGroup> = {
  audit: "compliance",
  "security-ops": "compliance",
  metrics: "operations",
  jobs: "operations",
};

const OVERSIGHT_SUBGROUP_ORDER: OversightSubGroup[] = ["compliance", "operations"];

export function financeSubgroupLabel(group: FinanceSubGroup): string {
  switch (group) {
    case "everyday":
      return t("nav.financeEveryday");
    case "schedule":
      return t("nav.financeSchedule");
    case "records":
      return t("nav.financeRecords");
    case "insights":
      return t("nav.financeInsights");
    case "organizational":
      return t("nav.financeOrganizational");
  }
}

function financeSubgroupHint(group: FinanceSubGroup): string {
  switch (group) {
    case "everyday":
      return t("nav.financeEverydayHint");
    case "schedule":
      return t("nav.financeScheduleHint");
    case "records":
      return t("nav.financeRecordsHint");
    case "insights":
      return t("nav.financeInsightsHint");
    case "organizational":
      return t("nav.financeOrganizationalHint");
  }
}

function buySubgroupLabel(group: BuySubGroup): string {
  return group === "source" ? t("nav.buySource") : t("nav.buyHoldings");
}

function buySubgroupHint(group: BuySubGroup): string {
  return group === "source" ? t("nav.buySourceHint") : t("nav.buyHoldingsHint");
}

function peopleSubgroupLabel(group: PeopleSubGroup): string {
  if (group === "membership") return t("nav.peopleMembership");
  if (group === "access") return t("nav.peopleAccess");
  return t("nav.peopleNetwork");
}

function peopleSubgroupHint(group: PeopleSubGroup): string {
  if (group === "membership") return t("nav.peopleMembershipHint");
  if (group === "access") return t("nav.peopleAccessHint");
  return t("nav.peopleNetworkHint");
}

function oversightSubgroupLabel(group: OversightSubGroup): string {
  return group === "compliance" ? t("nav.oversightCompliance") : t("nav.oversightOperations");
}

function oversightSubgroupHint(group: OversightSubGroup): string {
  return group === "compliance"
    ? t("nav.oversightComplianceHint")
    : t("nav.oversightOperationsHint");
}

/** Pack leaf destinations into domain subgroups (finance/buy/people/oversight). */
export function domainSubgroupPacks(
  domain: DomainGroupKey,
  items: ContextualMosaicItem[],
): SubgroupPack[] {
  if (domain === "finance") {
    const buckets = new Map<FinanceSubGroup, ContextualMosaicItem[]>();
    for (const key of FINANCE_SUBGROUP_ORDER) buckets.set(key, []);
    for (const item of items) {
      const key = FINANCE_SUBGROUP[item.key] ?? "records";
      buckets.get(key)!.push(item);
    }
    return FINANCE_SUBGROUP_ORDER.flatMap((key) => {
      const packItems = buckets.get(key) ?? [];
      if (packItems.length === 0) return [];
      return [
        {
          key,
          label: financeSubgroupLabel(key),
          hint: financeSubgroupHint(key),
          icon: (key === "everyday"
            ? "wallet"
            : key === "schedule"
              ? "receipt"
              : key === "insights"
                ? "search"
                : key === "organizational"
                  ? "settings"
                  : "receipt"),
          gemKey:
            key === "everyday"
              ? "amber"
              : key === "schedule"
                ? "olive"
                : key === "insights"
                  ? "sky"
                  : key === "organizational"
                    ? "indigo"
                    : "ocean",
          items: packItems,
        },
      ];
    });
  }

  if (domain === "buy") {
    const buckets = new Map<BuySubGroup, ContextualMosaicItem[]>();
    for (const key of BUY_SUBGROUP_ORDER) buckets.set(key, []);
    for (const item of items) {
      const key = BUY_SUBGROUP[item.key] ?? "source";
      buckets.get(key)!.push(item);
    }
    return BUY_SUBGROUP_ORDER.flatMap((key) => {
      const packItems = buckets.get(key) ?? [];
      if (packItems.length === 0) return [];
      return [
        {
          key,
          label: buySubgroupLabel(key),
          hint: buySubgroupHint(key),
          icon: (key === "source" ? "cart" : "box"),
          gemKey: key === "source" ? "teal" : "copper",
          items: packItems,
        },
      ];
    });
  }

  if (domain === "people") {
    const buckets = new Map<PeopleSubGroup, ContextualMosaicItem[]>();
    for (const key of PEOPLE_SUBGROUP_ORDER) buckets.set(key, []);
    for (const item of items) {
      const key = PEOPLE_SUBGROUP[item.key] ?? "membership";
      buckets.get(key)!.push(item);
    }
    return PEOPLE_SUBGROUP_ORDER.flatMap((key) => {
      const packItems = buckets.get(key) ?? [];
      if (packItems.length === 0) return [];
      return [
        {
          key,
          label: peopleSubgroupLabel(key),
          hint: peopleSubgroupHint(key),
          icon: (key === "access" ? "settings" : "partners"),
          gemKey: key === "membership" ? "violet" : key === "access" ? "slate" : "gold",
          items: packItems,
        },
      ];
    });
  }

  if (domain === "oversight") {
    const buckets = new Map<OversightSubGroup, ContextualMosaicItem[]>();
    for (const key of OVERSIGHT_SUBGROUP_ORDER) buckets.set(key, []);
    for (const item of items) {
      const key = OVERSIGHT_SUBGROUP[item.key] ?? "operations";
      buckets.get(key)!.push(item);
    }
    return OVERSIGHT_SUBGROUP_ORDER.flatMap((key) => {
      const packItems = buckets.get(key) ?? [];
      if (packItems.length === 0) return [];
      return [
        {
          key,
          label: oversightSubgroupLabel(key),
          hint: oversightSubgroupHint(key),
          icon: (key === "compliance" ? "settings" : "search"),
          gemKey: key === "compliance" ? "coral" : "blue",
          items: packItems,
        },
      ];
    });
  }

  return [
    {
      key: "everyday",
      label: domainGroupLabel(domain),
      hint: domainGroupHint(domain),
      icon: "settings",
      gemKey: DOMAIN_GROUP_GEM[domain],
      items,
    },
  ];
}

/** @deprecated Prefer domainSubgroupPacks — kept for finance-only call sites/tests. */
export function financeSubgroupSections(
  items: ContextualMosaicItem[],
): ContextualMosaicSection[] {
  return domainSubgroupPacks("finance", items).map((pack) => ({
    key: `finance-${pack.key}`,
    label: pack.label,
    description: pack.hint,
    items: pack.items,
  }));
}

export function parseDomainSubGroup(
  domain: DomainGroupKey,
  raw: string | null | undefined,
): DomainSubGroupKey | null {
  if (!raw) return null;
  if (domain === "finance") {
    if (FINANCE_SUBGROUP_ORDER.includes(raw as FinanceSubGroup)) {
      return raw as FinanceSubGroup;
    }
    // legacy alias from older «اسناد و گزارش»
    return raw === "documents" ? "records" : null;
  }
  if (domain === "buy") {
    return BUY_SUBGROUP_ORDER.includes(raw as BuySubGroup) ? (raw as BuySubGroup) : null;
  }
  if (domain === "people") {
    return PEOPLE_SUBGROUP_ORDER.includes(raw as PeopleSubGroup)
      ? (raw as PeopleSubGroup)
      : null;
  }
  if (domain === "oversight") {
    return OVERSIGHT_SUBGROUP_ORDER.includes(raw as OversightSubGroup)
      ? (raw as OversightSubGroup)
      : null;
  }
  return null;
}

export function domainSubGroupLabel(
  domain: DomainGroupKey,
  group: DomainSubGroupKey,
): string {
  if (domain === "finance") return financeSubgroupLabel(group as FinanceSubGroup);
  if (domain === "buy") return buySubgroupLabel(group as BuySubGroup);
  if (domain === "people") return peopleSubgroupLabel(group as PeopleSubGroup);
  if (domain === "oversight") return oversightSubgroupLabel(group as OversightSubGroup);
  return group;
}

/**
 * Second/third mosaic layer inside a domain folder.
 * Always surface **leaf destinations** as separate tiles (grouped by pack labels).
 * Optional `group` filters to one pack; without it, all packs' leaves are shown.
 */
export function domainDrillMosaicSections(
  domain: DomainGroupKey,
  section: ContextualMosaicSection,
  opts?: {
    slug: string;
    folderBase: DomainFolderBase;
    group?: string | null;
  },
): ContextualMosaicSection[] {
  const packs = domainSubgroupPacks(domain, section.items);
  if (packs.length === 0) return [];

  const selected = opts?.group ? parseDomainSubGroup(domain, opts.group) : null;
  if (selected) {
    const pack = packs.find((row) => row.key === selected);
    if (pack) {
      return [
        {
          key: `${domain}-${pack.key}`,
          label: pack.label,
          description: pack.hint,
          items: pack.items,
        },
      ];
    }
  }

  // Flat leaves — every feature is its own gem tile (no intermediate folder hop).
  return packs.map((pack) => ({
    key: `${domain}-${pack.key}`,
    label: pack.label,
    description: pack.hint,
    items: pack.items,
  }));
}

export function workspaceFolderHref(
  slug: string,
  base: DomainFolderBase,
  domain: DomainGroupKey | null = null,
  group: DomainSubGroupKey | null = null,
): string {
  const pathBase = base === "home" ? wPath(slug) : wPath(slug, "more");
  if (!domain) return pathBase;
  const params = new URLSearchParams({ folder: domain });
  if (group) params.set("group", group);
  return `${pathBase}?${params.toString()}`;
}

export function homeDomainHref(
  slug: string,
  domain: DomainGroupKey | null = null,
  group: DomainSubGroupKey | null = null,
): string {
  return workspaceFolderHref(slug, "home", domain, group);
}

export function moreDomainHref(
  slug: string,
  domain: DomainGroupKey | null = null,
  group: DomainSubGroupKey | null = null,
): string {
  return workspaceFolderHref(slug, "more", domain, group);
}

/** @deprecated Prefer moreDomainHref — intent folders retired as primary Tools IA. */
export function moreIntentHref(
  slug: string,
  intent: ContextualMosaicIntent | null = null,
): string {
  if (!intent) return moreDomainHref(slug);
  const map: Record<ContextualMosaicIntent, DomainGroupKey> = {
    decide: "finance",
    record: "buy",
    monitor: "oversight",
    manage: "people",
  };
  return moreDomainHref(slug, map[intent]);
}

export function contextualAccountNav(
  options: AccountNavOptions = {},
): ContextualMosaicItem[] {
  return [
    contextualItem({
      key: "profile",
      label: NAV_LABELS.profile,
      href: "/account",
      icon: "settings",
    }),
    ...accountNav(options).map(contextualItem),
  ];
}

/** Mobile/desktop primary tabs — unified home hub; expense via FAB. */
export function bottomTabsV2(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
): BottomTabV2[] {
  void template;
  void slug;
  return [
    {
      key: "home",
      label: NAV_LABELS.home,
      href: "/home",
      icon: "home",
    },
  ] satisfies BottomTabV2[];
}

export function expenseFabHref(
  template: WorkspaceTemplate | undefined,
  slug: string | null = null,
): string | null {
  const modules = modulesForTemplate(template);
  if (!modules.has("expenses")) return null;
  return `${scoped(slug, "record", hubPathFor("/workspaces"))}`;
}

export function isNavHrefActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0] ?? href;
  if (base === "/home" || base === "/hub") {
    return pathname === "/home" || pathname === "/hub" || pathname === "/";
  }
  if (/^\/w\/[^/]+$/.test(base)) {
    return pathname === base || pathname === `${base}/`;
  }
  if (base === "/spaces") {
    // Legacy list URL redirects to /home; keep /spaces/new|reports active separately.
    return pathname === "/spaces" || pathname === "/home";
  }
  if (base === "/account") {
    return pathname === "/account" || pathname.startsWith("/account/");
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}
