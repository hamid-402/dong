import type { NavNode } from "@/lib/navigation-types";

/**
 * Product menu tree for mosaic hub (from classic sidebar NAV). Additive space section.
 * @deprecated Prefer `/w/[slug]/…` workspace routes — this tree feeds hub/classic fallbacks only.
 */
export const RAW_MENU_ITEMS: NavNode[] = [
  {
    key: "spaces",
    label: "فضاها",
    description: "شخصی، گروهی و سازمانی — جدا و هم‌زمان",
    isGroup: true,
    icon: "home",
    gemKey: "teal",
    children: [
      {
        key: "/me",
        label: "شخصی (دفتر من)",
        description: "خرج خصوصی فقط برای خودم",
        route: "/me",
        icon: "wallet",
        gemKey: "mint",
      },
      {
        key: "/group",
        label: "گروه‌ها و دوستان",
        description: "دنگ جمعی، ناهار مبلغی، مانده",
        route: "/group",
        icon: "partners",
        gemKey: "coral",
      },
      {
        key: "/orgs",
        label: "سازمان‌ها",
        description: "تیم و شرکت — بودجه و خرید",
        route: "/orgs",
        icon: "box",
        gemKey: "deep",
      },
    ],
  },
  {
    key: "overview",
    label: "نمای کلی",
    description: "خلاصه مانده، کارها و وضعیت فضای کاری",
    route: "/overview",
    icon: "home",
    gemKey: "teal",
  },
  {
    key: "finance",
    label: "خرج‌ها و تسویه",
    description: "خرج جمعی، خصوصی، شرکتی و تسویه",
    isGroup: true,
    icon: "wallet",
    gemKey: "gold",
    children: [
      {
        key: "/workspaces",
        label: "ثبت و تفکیک خرج",
        description: "جمعی · خصوصی · جاری شرکت",
        route: "/workspaces",
        icon: "receipt",
        gemKey: "mint",
      },
      {
        key: "/daily-ledger",
        label: "دفتر روزانه",
        description: "جدول روز×عضو مثل اکسل — کالا و مبلغ جدا",
        route: "/daily-ledger",
        icon: "receipt",
        gemKey: "coral",
      },
      {
        key: "/workspaces/invite",
        label: "دعوت دوست / عضو",
        description: "افزودن نفر به گروه با لینک یا ایمیل",
        route: "/workspaces/invite",
        icon: "partners",
        gemKey: "amber",
      },
    ],
  },
  {
    key: "buy",
    label: "خرید",
    description: "تدارکات، درخواست خرید و تجهیزات",
    isGroup: true,
    icon: "cart",
    gemKey: "deep",
    children: [
      {
        key: "/workspaces/procurement",
        label: "تدارکات",
        description: "نیاز، درخواست و پیگیری خرید",
        route: "/workspaces/procurement",
        icon: "cart",
        gemKey: "teal",
      },
      {
        key: "/proposals",
        label: "پیشنهاد و رأی",
        description: "پیشنهاد کالا/خدمت، رأی اعضا و حدنصاب",
        route: "/proposals",
        icon: "cart",
        gemKey: "amber",
      },
      {
        key: "/workspaces/assets",
        label: "تجهیزات",
        description: "دارایی‌های قابل پیگیری فضا",
        route: "/workspaces/assets",
        icon: "box",
        gemKey: "slate",
      },
    ],
  },
  {
    key: "partners",
    label: "شرکا",
    description: "حساب شرکا و وضعیت همکاری",
    route: "/workspaces/partnership",
    icon: "partners",
    gemKey: "ivory",
  },
  {
    key: "manage",
    label: "مدیریت",
    description: "ساخت فضا، دعوت و تنظیمات",
    isGroup: true,
    icon: "settings",
    gemKey: "slate",
    children: [
      {
        key: "/onboarding",
        label: "ساخت فضا",
        description: "راه‌اندازی فضای کاری جدید",
        route: "/onboarding",
        icon: "settings",
        gemKey: "gold",
      },
      {
        key: "/invite",
        label: "پذیرش دعوت",
        description: "پیوستن با لینک دعوت",
        route: "/invite",
        icon: "partners",
        gemKey: "coral",
      },
      {
        key: "/profile",
        label: "پروفایل کاربری",
        description: "نام، تنظیمات و امنیت حساب",
        route: "/profile",
        icon: "settings",
        gemKey: "ivory",
      },
    ],
  },
];

export function buildNavTree(items: NavNode[]): NavNode[] {
  return items;
}

export function resolveStack(
  rootNodes: NavNode[],
  groupKeys: string[],
): { stack: NavNode[]; currentNodes: NavNode[] } | null {
  const stack: NavNode[] = [];
  let current = rootNodes;

  for (const key of groupKeys) {
    const node = current.find((n) => n.key === key);
    if (!node?.isGroup || !node.children) return null;
    stack.push(node);
    current = node.children;
  }
  return { stack, currentNodes: current };
}

export const HUB_BOTTOM_TABS = [
  { key: "home", path: "/hub", label: "خانه", icon: "home" as const },
  { key: "space", path: "/hub/spaces", label: "فضا", icon: "partners" as const },
  { key: "finance", path: "/hub/finance", label: "خرج‌ها", icon: "wallet" as const },
  { key: "more", path: "/hub/manage", label: "حساب من", icon: "settings" as const },
];
