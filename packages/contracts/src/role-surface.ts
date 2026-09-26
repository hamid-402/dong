/**
 * Product surface for the 6-role UX model (4 core + 2 advanced).
 * DB/API may still store all MembershipRole values — this module governs
 * what appears in invite/add-member UI and which nav personas apply.
 */

import { EXPENSE_APPROVER_ROLES, roleInSet } from "./access-policy.js";

/** Local alias — avoid circular import with index.ts. */
type MembershipRole =
  | "owner"
  | "admin"
  | "finance"
  | "deputy_finance"
  | "approver"
  | "buyer"
  | "asset_custodian"
  | "member"
  | "auditor"
  | "guest";

/** Always offered when inviting / adding (core product surface). */
export const UI_ROLE_CORE = [
  "finance",
  "admin",
  "member",
  "guest",
] as const satisfies readonly MembershipRole[];

/**
 * Shown only when product flags unlock org/buy workflows.
 * approver ← approvalQueue | expensePolicy
 * buyer ← when template has procurement/assets
 */
export const UI_ROLE_ADVANCED = [
  "approver",
  "buyer",
] as const satisfies readonly MembershipRole[];

/** Roles the invite API may assign (6-role UI + auditor for ناظر). */
export const INVITE_ASSIGNABLE_ROLES: readonly MembershipRole[] = [
  "admin",
  "finance",
  "approver",
  "buyer",
  "member",
  "guest",
  "auditor",
];

export type InviteRoleOptionFlags = {
  showApprover?: boolean;
  showBuyer?: boolean;
  showAuditor?: boolean;
};

export type UiRoleOption = {
  value: MembershipRole;
  labelFa: string;
  tier: "core" | "advanced";
};

const LABELS: Record<string, string> = {
  finance: "مادرخرج / مدیر مالی",
  admin: "ادمین — مثل مالک بدون حذف فضا",
  member: "عضو",
  guest: "مهمان موقت",
  approver: "تأییدکننده",
  buyer: "خریدار",
  auditor: "ناظر (فقط مشاهده / گزارش)",
};

/**
 * Ordered options for invite + add-member dropdowns (6-role product surface).
 */
export function uiInviteRoleOptions(
  flags: InviteRoleOptionFlags = {},
): UiRoleOption[] {
  const out: UiRoleOption[] = UI_ROLE_CORE.map((value) => ({
    value,
    labelFa: LABELS[value] ?? value,
    tier: "core" as const,
  }));
  if (flags.showApprover) {
    out.push({
      value: "approver",
      labelFa: LABELS.approver!,
      tier: "advanced",
    });
  }
  if (flags.showBuyer) {
    out.push({
      value: "buyer",
      labelFa: LABELS.buyer!,
      tier: "advanced",
    });
  }
  if (flags.showAuditor) {
    out.push({
      value: "auditor",
      labelFa: LABELS.auditor!,
      tier: "advanced",
    });
  }
  return out;
}

/**
 * When editing an existing member whose role is legacy/hidden from invite UI,
 * keep that value selectable so the dropdown does not silently clear.
 */
export function uiRoleOptionsIncludingCurrent(
  flags: InviteRoleOptionFlags,
  currentRole: string | null | undefined,
): UiRoleOption[] {
  const opts = uiInviteRoleOptions(flags);
  if (!currentRole || currentRole === "owner") return opts;
  if (opts.some((o) => o.value === currentRole)) return opts;
  return [
    ...opts,
    {
      value: currentRole as MembershipRole,
      labelFa: LABELS[currentRole] ?? currentRole,
      tier: "advanced",
    },
  ];
}

export function isExpenseApproverRole(
  role: string | null | undefined,
): boolean {
  return roleInSet(role, EXPENSE_APPROVER_ROLES);
}

export const MEMBERSHIP_MANAGER_ROLES = [
  "owner",
  "admin",
  "finance",
] as const satisfies readonly MembershipRole[];

export function isMembershipManagerRole(
  role: string | null | undefined,
): boolean {
  return roleInSet(role, MEMBERSHIP_MANAGER_ROLES);
}

/** Nav keys (NavItemV2.key) a guest may see. */
export const GUEST_NAV_KEYS = new Set([
  "space",
  "expenses",
  "settlements",
  "members",
  "settings",
  "statements",
  "more",
]);

/** Auditor: guest set + read/report surfaces. */
export const AUDITOR_NAV_KEYS = new Set([
  ...GUEST_NAV_KEYS,
  "audit",
  "metrics",
  "charts",
  "invoices",
  "ledger",
  "payments",
]);

/** Member: group-minimal; specialized modules unlock via flags/template elsewhere. */
export const MEMBER_NAV_KEYS = new Set([
  ...GUEST_NAV_KEYS,
  "invoices",
  "recurring",
  "proposals",
  "addons",
]);

/** Approver: queue-first shell. */
export const APPROVER_NAV_KEYS = new Set([
  "space",
  "expenses",
  "approvals",
  "settlements",
  "members",
  "settings",
  "more",
]);

/** Buyer: procurement rail. */
export const BUYER_NAV_KEYS = new Set([
  "space",
  "expenses",
  "procurement",
  "assets",
  "catalog",
  "members",
  "settings",
  "more",
]);

/**
 * Product persona for the 6-role UX (maps legacy 10-role enum → shell).
 * `null` = role not loaded yet (stay discoverable).
 */
export type UiPersona =
  | "owner"
  | "finance"
  | "member"
  | "guest"
  | "approver"
  | "buyer"
  | "auditor";

export function resolveUiPersona(
  role: string | null | undefined,
): UiPersona | null {
  if (role == null || role === "") return null;
  switch (role) {
    case "owner":
    case "admin":
      return "owner";
    case "finance":
    case "deputy_finance":
      return "finance";
    case "approver":
      return "approver";
    case "buyer":
      return "buyer";
    case "guest":
      return "guest";
    case "auditor":
      return "auditor";
    case "member":
    case "asset_custodian":
      return "member";
    default:
      return "member";
  }
}

export type RoleNavProfile = {
  persona: UiPersona;
  /** `"all"` = template/flag gates only (owner/finance). */
  navKeys: ReadonlySet<string> | "all";
  homeHintFa: string;
};

/**
 * Six-persona nav profile — progressive shells on top of template/flag gates.
 */
export function roleNavProfile(
  role: string | null | undefined,
): RoleNavProfile | null {
  const persona = resolveUiPersona(role);
  if (!persona) return null;
  switch (persona) {
    case "owner":
      return {
        persona,
        navKeys: "all",
        homeHintFa: "خانهٔ مالک: مانده · دعوت · تأییدهای باز · چرخهٔ عمر",
      };
    case "finance":
      return {
        persona,
        navKeys: "all",
        homeHintFa: "هاب مادرخرج: مانده · تأیید · صورتحساب · یادآوری بدهی",
      };
    case "member":
      return {
        persona,
        navKeys: MEMBER_NAV_KEYS,
        homeHintFa: "خرج · مانده · تسویه · اعضا",
      };
    case "guest":
      return {
        persona,
        navKeys: GUEST_NAV_KEYS,
        homeHintFa: "دسترسی مهمان — مشاهدهٔ محدود و ترک فضا",
      };
    case "approver":
      return {
        persona,
        navKeys: APPROVER_NAV_KEYS,
        homeHintFa: "صف تأیید و پیش‌نویس‌های منتظر",
      };
    case "buyer":
      return {
        persona,
        navKeys: BUYER_NAV_KEYS,
        homeHintFa: "راه‌آهن خرید و اموال",
      };
    case "auditor":
      return {
        persona,
        navKeys: AUDITOR_NAV_KEYS,
        homeHintFa: "ناظر گزارش‌خوان — audit و متریک",
      };
  }
}

/**
 * Whether a mosaic/nav item key should appear for this membership role.
 * Empty role → allow (gated pages wait for role separately).
 */
export function roleAllowsNavKey(
  role: string | null | undefined,
  navKey: string,
): boolean {
  const profile = roleNavProfile(role);
  if (!profile) return true;
  if (profile.navKeys === "all") return true;
  return profile.navKeys.has(navKey);
}

/** Deep-link block reasons for constrained personas. */
export function roleBlocksWorkspacePage(
  role: string | null | undefined,
  page: string,
): string | null {
  if (role == null || role === "") return null;
  const persona = resolveUiPersona(role);
  if (!persona) return null;

  if (persona === "guest") {
    const allowed = new Set([
      "home",
      "space",
      "expenses",
      "settlements",
      "members",
      "settings",
      "statements",
      "more",
    ]);
    if (!allowed.has(page)) {
      return "دسترسی مهمان فقط به خانه، خرج، تسویه، اعضا و تنظیمات (ترک) است.";
    }
    return null;
  }

  if (persona === "auditor") {
    const denied = new Set([
      "procurement",
      "partners",
      "permissions",
      "jobs",
      "securityOps",
      "orgFinance",
      "approvals",
    ]);
    if (denied.has(page)) {
      return "ناظر به این مسیر عملیاتی دسترسی ندارد — از گزارش، audit و متریک استفاده کنید.";
    }
    return null;
  }

  if (persona === "member") {
    const denied = new Set([
      "approvals",
      "jobs",
      "securityOps",
      "permissions",
      "orgFinance",
      "metrics",
    ]);
    if (denied.has(page)) {
      return "این مسیر برای نقش عضو باز نیست — از خرج، تسویه و اعضا استفاده کنید.";
    }
    return null;
  }

  if (persona === "approver") {
    const denied = new Set([
      "procurement",
      "partners",
      "jobs",
      "securityOps",
      "permissions",
      "orgFinance",
      "metrics",
      "catalog",
      "assets",
    ]);
    if (denied.has(page)) {
      return "تأییدکننده روی صف تأیید و خرج تمرکز دارد — این مسیر برای نقش شما نیست.";
    }
    return null;
  }

  if (persona === "buyer") {
    const denied = new Set([
      "approvals",
      "jobs",
      "securityOps",
      "permissions",
      "orgFinance",
      "metrics",
      "partners",
    ]);
    if (denied.has(page)) {
      return "خریدار روی تدارکات و اموال تمرکز دارد — این مسیر برای نقش شما نیست.";
    }
    return null;
  }

  return null;
}
