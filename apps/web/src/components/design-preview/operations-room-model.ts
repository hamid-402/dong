import {
  isFinanceManagerRole,
  isReadOnlyRole,
  spaceKindForTemplate,
  workspaceTemplateCatalog,
  type MembershipRole,
  type WorkspaceTemplate,
} from "@dang/contracts";

export type PreviewScope = "public" | "account" | "workspace";
export type PreviewGroup =
  | "auth"
  | "account"
  | "home"
  | "finance"
  | "operations"
  | "workspace"
  | "system";
export type PreviewFlag =
  | "addonAck"
  | "approvalQueue"
  | "orgFinance";

export type PreviewScreen = {
  id: string;
  title: string;
  eyebrow: string;
  scope: PreviewScope;
  group: PreviewGroup;
  summary: string;
  primaryAction?: string;
  module?: string;
  flag?: PreviewFlag;
  orgOnly?: boolean;
};

export const PREVIEW_SCREENS = [
  { id: "login", title: "ورود", eyebrow: "احراز هویت", scope: "public", group: "auth", summary: "ورود با رمز یا ارائه‌دهنده هویت واقعی." },
  { id: "register", title: "ساخت حساب", eyebrow: "شروع", scope: "public", group: "auth", summary: "ثبت حساب با تأیید ایمیل و قوانین روشن." },
  { id: "forgot-password", title: "فراموشی رمز", eyebrow: "بازیابی", scope: "public", group: "auth", summary: "درخواست امن پیوند بازیابی رمز." },
  { id: "reset-password", title: "تنظیم رمز تازه", eyebrow: "بازیابی", scope: "public", group: "auth", summary: "ثبت رمز تازه و پایان نشست‌های قبلی." },
  { id: "verify-email", title: "تأیید ایمیل", eyebrow: "فعال‌سازی", scope: "public", group: "auth", summary: "وضعیت تأیید و ارسال دوباره پیام." },
  { id: "invite", title: "پذیرش دعوت", eyebrow: "پیوستن", scope: "public", group: "auth", summary: "بررسی فضای مقصد، نقش و پذیرش دعوت." },

  { id: "account", title: "حساب من", eyebrow: "حساب", scope: "account", group: "account", summary: "مشخصات، زبان، منطقه زمانی و خروج امن.", primaryAction: "ذخیره مشخصات" },
  { id: "account-security", title: "امنیت حساب", eyebrow: "حساب", scope: "account", group: "account", summary: "رمز، نشست‌ها، MFA و اعلان‌های امنیتی.", primaryAction: "مدیریت MFA" },
  { id: "spaces", title: "فضاهای من", eyebrow: "انتخاب زمینه", scope: "account", group: "account", summary: "فضاهای شخصی، گروهی و سازمانی.", primaryAction: "ساخت فضای تازه" },
  { id: "spaces-new", title: "ساخت فضای تازه", eyebrow: "راه‌اندازی", scope: "account", group: "account", summary: "انتخاب الگو و ساخت فضای کاری بدون داده نمایشی.", primaryAction: "ادامه ساخت" },
  { id: "whats-new", title: "تغییرات اخیر", eyebrow: "محصول", scope: "account", group: "system", summary: "قابلیت‌های واقعاً تحویل‌شده و تاریخ انتشار." },
  { id: "ui-kit", title: "سامانه طراحی", eyebrow: "مرجع داخلی", scope: "account", group: "system", summary: "توکن‌ها، کنترل‌ها و وضعیت‌های دسترس‌پذیر." },

  { id: "workspace-home", title: "اتاق عملیات", eyebrow: "نمای امروز", scope: "workspace", group: "home", summary: "مانده، صف تصمیم، جریان اخیر و ریتم عملیات.", primaryAction: "ثبت خرج" },
  { id: "workspace-space", title: "نمای فضا", eyebrow: "زمینه کاری", scope: "workspace", group: "home", summary: "نمای متناسب با فضای شخصی، گروهی یا سازمانی." },
  { id: "expenses", title: "خرج‌ها", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "خرج‌های جمعی، خصوصی و شرکتی با چرخه کامل.", primaryAction: "ثبت خرج", module: "expenses" },
  { id: "settlements", title: "تسویه‌ها", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "ادعا، تأیید، اعتراض، لغو و ساده‌سازی بدهی.", primaryAction: "ثبت تسویه", module: "settlements" },
  { id: "invoices", title: "صورتحساب‌ها", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "دوره، تولید، صدور، تأیید و پرداخت صورتحساب.", primaryAction: "ساخت دوره", module: "expenses" },
  { id: "recurring", title: "تکرارشونده و گزارش", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "قواعد دوره‌ای، گزارش بازه‌ای، دسته و خروجی.", primaryAction: "قاعده تازه", module: "expenses" },
  { id: "addons", title: "اضافه شخصی", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "هزینه افزوده برای عضو هدف و تأیید دریافت.", primaryAction: "ثبت اضافه", module: "expenses", flag: "addonAck" },
  { id: "approvals", title: "مرکز تأیید", eyebrow: "تصمیم", scope: "workspace", group: "finance", summary: "صف یکپارچه خرج، صورتحساب و اضافه شخصی.", primaryAction: "بررسی مورد بعد", module: "expenses", flag: "approvalQueue" },
  { id: "org-finance", title: "کنترل مالی سازمان", eyebrow: "مالی سازمان", scope: "workspace", group: "finance", summary: "مرکز هزینه، سقف، بازپرداخت، سیاست، بودجه و نرخ ارز.", primaryAction: "باز کردن ابزار", module: "expenses", flag: "orgFinance", orgOnly: true },
  { id: "ledger", title: "دفتر روزانه", eyebrow: "مالی", scope: "workspace", group: "finance", summary: "بازه شمسی، قلم‌ها، تعطیلی، CSV و پیشنهاد تسویه.", primaryAction: "ثبت قلم", module: "expenses" },
  { id: "procurement", title: "تدارکات", eyebrow: "خرید", scope: "workspace", group: "operations", summary: "نیاز، درخواست خرید، فروشنده، سفارش و تحویل.", primaryAction: "درخواست خرید", module: "procurement" },
  { id: "proposals", title: "پیشنهاد و رأی", eyebrow: "حاکمیت", scope: "workspace", group: "operations", summary: "پیشنهاد، حدنصاب، رأی و انتقال به نیاز.", primaryAction: "ثبت پیشنهاد", module: "proposals" },
  { id: "assets", title: "تجهیزات", eyebrow: "عملیات", scope: "workspace", group: "operations", summary: "دارایی، تحویل، تخصیص، انتقال و خرابی.", primaryAction: "ثبت دارایی", module: "assets" },
  { id: "members", title: "اعضا و دعوت", eyebrow: "فضای کاری", scope: "workspace", group: "workspace", summary: "عضویت، نقش، سهم و دعوت با قانون دو مدیر مالی.", primaryAction: "دعوت عضو", module: "invites" },
  { id: "partners", title: "شرکا", eyebrow: "فضای کاری", scope: "workspace", group: "workspace", summary: "قرارداد، آورده، قرض، مالکیت، گزارش و قفل دوره.", primaryAction: "ثبت قرارداد", module: "partnerships" },
  { id: "settings", title: "تنظیمات فضا", eyebrow: "فضای کاری", scope: "workspace", group: "workspace", summary: "نام، الگو، واحد نمایش و مقصدهای مدیریتی.", primaryAction: "ذخیره تنظیمات" },
  { id: "audit", title: "تاریخچه عملیات", eyebrow: "فضای کاری", scope: "workspace", group: "system", summary: "رخدادهای واقعی audit با نتیجه، عامل و فراداده ثبت‌شده." },
  { id: "metrics", title: "متریک محصول", eyebrow: "سامانه", scope: "workspace", group: "system", summary: "شاخص‌های واقعی محصول و وضعیت ثبت رویداد." },
  { id: "more", title: "همه ابزارها", eyebrow: "ناوبری", scope: "workspace", group: "system", summary: "تمام مقصدهای مجاز بر اساس الگو و قابلیت runtime." },
] as const satisfies readonly PreviewScreen[];

export type PreviewScreenId = (typeof PREVIEW_SCREENS)[number]["id"];

export const PREVIEW_ALIASES: Readonly<Record<string, PreviewScreenId>> = {
  "/": "workspace-home",
  "/overview": "workspace-home",
  "/workspaces": "expenses",
  "/workspaces#settlement-panel": "settlements",
  "/workspaces#period-invoice-panel": "invoices",
  "/workspaces#reports-panel": "recurring",
  "/daily-ledger": "ledger",
  "/workspaces/invite": "members",
  "/workspaces/procurement": "procurement",
  "/proposals": "proposals",
  "/workspaces/assets": "assets",
  "/workspaces/partnership": "partners",
  "/me": "workspace-space",
  "/group": "workspace-space",
  "/groups": "workspace-space",
  "/orgs": "workspace-space",
  "/profile": "account",
  "/onboarding": "spaces-new",
};

export const PREVIEW_ROLES: readonly MembershipRole[] = [
  "owner",
  "admin",
  "finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
  "guest",
];

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "مالک",
  admin: "ادمین",
  finance: "مدیر مالی",
  approver: "تأییدکننده",
  buyer: "خریدار",
  asset_custodian: "امانت‌دار تجهیزات",
  member: "عضو",
  auditor: "ناظر",
  guest: "مهمان",
};

export const PREVIEW_TEMPLATES: readonly WorkspaceTemplate[] =
  workspaceTemplateCatalog.map((template) => template.id);

export const TEMPLATE_LABELS = Object.fromEntries(
  workspaceTemplateCatalog.map((template) => [template.id, template.titleFa]),
) as Record<WorkspaceTemplate, string>;

export type PreviewFlagMode = "full" | "core";
export type PreviewMfaMode = "enrolled" | "required";

export type PreviewContext = {
  role: MembershipRole;
  template: WorkspaceTemplate;
  flagMode: PreviewFlagMode;
  mfa: PreviewMfaMode;
};

const SPECIALIZED_WRITE_ROLES: Partial<
  Record<PreviewScreenId, readonly MembershipRole[]>
> = {
  members: ["owner", "admin"],
  approvals: ["owner", "admin", "finance", "approver"],
  procurement: ["owner", "admin", "finance", "buyer"],
  assets: ["owner", "admin", "finance", "buyer", "asset_custodian"],
  partners: ["owner", "admin", "finance"],
  "org-finance": ["owner", "admin", "finance"],
  metrics: ["owner", "admin"],
  settings: ["owner", "admin"],
};

function templateModules(template: WorkspaceTemplate): Set<string> {
  const item = workspaceTemplateCatalog.find((entry) => entry.id === template);
  return new Set(item?.defaultModules ?? []);
}

function moduleAvailable(module: string, template: WorkspaceTemplate): boolean {
  const modules = templateModules(template);
  if (module === "settlements") return modules.has("settlements") || modules.has("expenses");
  if (module === "assets") return modules.has("assets") || modules.has("assets_light");
  return modules.has(module);
}

export type PreviewAccess = {
  visible: boolean;
  writable: boolean;
  needsMfa: boolean;
  reason: string;
};

export function previewAccess(
  screen: PreviewScreen,
  context: PreviewContext,
): PreviewAccess {
  if (screen.scope === "public") {
    return { visible: true, writable: true, needsMfa: false, reason: "مسیر عمومی" };
  }
  if (screen.scope === "account") {
    return { visible: true, writable: true, needsMfa: false, reason: "حساب احراز‌شده" };
  }

  const kind = spaceKindForTemplate(context.template);
  if (screen.orgOnly && kind !== "org") {
    return { visible: false, writable: false, needsMfa: false, reason: "فقط فضای سازمانی" };
  }
  if (screen.module && !moduleAvailable(screen.module, context.template)) {
    return {
      visible: false,
      writable: false,
      needsMfa: false,
      reason: `ماژول ${screen.module} در این الگو فعال نیست`,
    };
  }
  if (screen.flag && context.flagMode === "core") {
    return {
      visible: false,
      writable: false,
      needsMfa: false,
      reason: "قابلیت در حالت Core خاموش است",
    };
  }
  if (screen.id === "proposals" && kind === "personal") {
    return { visible: false, writable: false, needsMfa: false, reason: "فضای شخصی رأی‌گیری ندارد" };
  }

  const specialized = SPECIALIZED_WRITE_ROLES[screen.id as PreviewScreenId];
  const writable = specialized
    ? specialized.includes(context.role)
    : !isReadOnlyRole(context.role);
  const needsMfa =
    writable &&
    isFinanceManagerRole(context.role) &&
    context.mfa === "required" &&
    ["settlements", "invoices", "org-finance", "partners"].includes(screen.id);

  return {
    visible: true,
    writable: writable && !needsMfa,
    needsMfa,
    reason: needsMfa
      ? "اقدام حساس تا فعال‌سازی MFA متوقف است"
      : writable
        ? "امکان مشاهده و اقدام"
        : isReadOnlyRole(context.role)
          ? "فقط مشاهده"
          : "مشاهده مجاز؛ اقدام نیازمند نقش تخصصی",
  };
}

export function getPreviewScreen(id: string | undefined): PreviewScreen {
  return (
    PREVIEW_SCREENS.find((screen) => screen.id === id) ??
    PREVIEW_SCREENS.find((screen) => screen.id === "workspace-home")!
  );
}

export function previewHref(id: PreviewScreenId): string {
  return `/design-preview/operations-room/${id}`;
}

export function visiblePreviewScreens(context: PreviewContext): PreviewScreen[] {
  return PREVIEW_SCREENS.filter((screen) => previewAccess(screen, context).visible);
}

export const GROUP_LABELS: Record<PreviewGroup, string> = {
  auth: "ورود و دسترسی",
  account: "حساب و فضاها",
  home: "اتاق",
  finance: "مالی",
  operations: "عملیات و حاکمیت",
  workspace: "مدیریت فضا",
  system: "سامانه",
};
