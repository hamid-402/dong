import type {
  ProductFeatureFlags,
  SystemCapabilities,
  WorkspaceTemplate,
} from "@dang/contracts";
import {
  canManageJobsDlq,
  canViewProductMetrics as canViewProductMetricsStrict,
  isExpenseApproverRole,
  roleBlocksWorkspacePage,
  spaceKindForTemplate,
} from "@dang/contracts";
import { modulesForTemplate } from "@/lib/workspace-modules";
import type { WorkspacePage } from "@/lib/workspace-paths";

export type PageAccessResult = {
  allowed: boolean;
  reason: string;
};

type AccessFlags = Partial<ProductFeatureFlags> & {
  /** Honest signal — jobs page available (inline stub or Redis queue). */
  jobsAvailable?: boolean;
  /** Honest signal from capabilities.providers.jobs === redis_queue (DLQ). */
  jobsRedisQueue?: boolean;
  /** Honest signal from capabilities.providers.catalog */
  catalogV1?: boolean;
  /** Honest signal from capabilities.providers.statements */
  statementsV1?: boolean;
  /** Honest signal from capabilities.providers.charts */
  chartsV1?: boolean;
  /** Honest signal from capabilities.providers.paymentReceipts */
  paymentReceiptsV1?: boolean;
  /** Honest signal from capabilities.providers.accessPolicy */
  accessPolicyGrants?: boolean;
  /** Honest: antifraud heuristics or maker-checker live → security-ops page. */
  securityOpsV1?: boolean;
  /** platform_owner / platform_support — jobs + product metrics. */
  platformConsole?: boolean;
};

function orgFinanceLive(flags?: AccessFlags): boolean {
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

/**
 * Nav-friendly metrics visibility: unknown role stays discoverable until membership loads.
 * Page gate and API use the strict contracts helper.
 */
export function canViewProductMetrics(
  role: string | null | undefined,
): boolean {
  if (role == null || role === "") return true;
  return canViewProductMetricsStrict(role);
}

/** Owner/admin only — matches JobsService JOBS_DLQ_ROLES. Nav: empty role stays discoverable. */
export function canViewJobsDlq(
  role: string | null | undefined,
): boolean {
  if (role == null || role === "") return true;
  return canManageJobsDlq(role);
}

export function canViewJobsDlqStrict(
  role: string | null | undefined,
): boolean {
  return canManageJobsDlq(role);
}

/** Merge product flags + jobs provider + platform role for nav/access. */
export function spaceNavFlagsFromCapabilities(
  capabilities: SystemCapabilities | null | undefined,
  platformRole?: string | null,
): AccessFlags {
  return {
    ...capabilities?.productFlags,
    jobsAvailable:
      capabilities?.providers?.jobs === "redis_queue" ||
      capabilities?.providers?.jobs === "inline_stub",
    jobsRedisQueue:
      capabilities?.providers?.jobs === "redis_queue" ||
      capabilities?.providers?.jobs === "redis_queue_degraded",
    catalogV1: capabilities?.providers?.catalog === "catalog_v1",
    statementsV1: capabilities?.providers?.statements === "csv_json_print_v1",
    chartsV1: capabilities?.providers?.charts === "charts_v1",
    paymentReceiptsV1:
      capabilities?.providers?.paymentReceipts === "manual_review_v1",
    accessPolicyGrants: capabilities?.providers?.accessPolicy === "rbac_abac_grants_v1",
    securityOpsV1:
      capabilities?.providers?.antifraud === "heuristics_v1" ||
      (capabilities?.providers?.makerChecker != null &&
        capabilities.providers.makerChecker !== "off"),
    platformConsole:
      platformRole === "platform_owner" || platformRole === "platform_support",
  };
}

/**
 * Honest page access for deep links — same rules as spaceNav filters.
 * Routes stay registered; UI shows EmptyHint when denied.
 */
export function workspacePageAccess(input: {
  page: WorkspacePage;
  template: WorkspaceTemplate | undefined;
  flags?: AccessFlags;
  role?: string | null;
}): PageAccessResult {
  const { page, template, flags, role } = input;
  const personaBlock = roleBlocksWorkspacePage(role, page);
  if (personaBlock) {
    return { allowed: false, reason: personaBlock };
  }
  const modules = modulesForTemplate(template);
  const kind = spaceKindForTemplate(template);
  const has = (mod: string) => modules.has(mod);

  switch (page) {
    case "procurement":
      if (!has("procurement")) {
        return {
          allowed: false,
          reason:
            "ماژول تدارکات برای این قالب فضای کاری فعال نیست. از ناوبری قالب‌های سازمانی استفاده کنید.",
        };
      }
      return { allowed: true, reason: "" };

    case "proposals":
      if (!has("proposals")) {
        return {
          allowed: false,
          reason: "ماژول پیشنهاد برای این قالب فعال نیست.",
        };
      }
      return { allowed: true, reason: "" };

    case "assets":
      if (!(has("assets") || has("assets_light"))) {
        return {
          allowed: false,
          reason: "ماژول اموال برای این قالب فعال نیست.",
        };
      }
      return { allowed: true, reason: "" };

    case "catalog":
      if (kind === "personal") {
        return {
          allowed: false,
          reason: "کاتالوگ گروهی در فضای شخصی نیست.",
        };
      }
      if (!flags?.catalogV1) {
        return {
          allowed: false,
          reason: "کاتالوگ در این محیط فعال نیست.",
        };
      }
      if (!has("expenses")) {
        return { allowed: false, reason: "ماژول مالی برای این قالب فعال نیست." };
      }
      return { allowed: true, reason: "" };

    case "statements":
      if (!flags?.statementsV1) {
        return {
          allowed: false,
          reason:
            "صورتحساب اعضا فقط وقتی قابلیت صورتحساب در این محیط روشن باشد در دسترس است.",
        };
      }
      if (!has("expenses")) {
        return { allowed: false, reason: "ماژول مالی برای این قالب فعال نیست." };
      }
      return { allowed: true, reason: "" };

    case "payments":
      if (!flags?.paymentReceiptsV1) {
        return {
          allowed: false,
          reason:
            "پرداخت‌ها فقط وقتی قابلیت ثبت فیش در این محیط روشن باشد در دسترس است.",
        };
      }
      if (!has("settlements") && !has("expenses")) {
        return { allowed: false, reason: "ماژول مالی برای این قالب فعال نیست." };
      }
      return { allowed: true, reason: "" };

    case "charts":
      if (!flags?.chartsV1) {
        return {
          allowed: false,
          reason: "نمودارها فقط وقتی قابلیت نمودار در این محیط روشن باشد در دسترس است.",
        };
      }
      return { allowed: true, reason: "" };

    case "permissions":
      if (flags?.accessPolicyGrants !== true) {
        return {
          allowed: false,
          reason: "دسترسی قابل‌ویرایش در این محیط فعال نیست.",
        };
      }
      return { allowed: true, reason: "" };

    case "partners":
      if (!has("partnerships")) {
        return {
          allowed: false,
          reason: "ماژول شراکت برای این قالب فعال نیست.",
        };
      }
      return { allowed: true, reason: "" };

    case "orgFinance":
      if (kind !== "org") {
        return {
          allowed: false,
          reason: "مالی سازمانی فقط در فضاهای سازمانی در دسترس است.",
        };
      }
      if (!orgFinanceLive(flags)) {
        return {
          allowed: false,
          reason:
            "هیچ قابلیت مالی سازمانی در این محیط روشن نیست.",
        };
      }
      return { allowed: true, reason: "" };

    case "addons":
      if (!flags?.addonAck) {
        return {
          allowed: false,
          reason:
            "این قابلیت پشت پرچم محصول خاموش است (ENABLE_ADDON_ACK / addonAck).",
        };
      }
      if (!has("expenses")) {
        return { allowed: false, reason: "ماژول مالی برای این قالب فعال نیست." };
      }
      return { allowed: true, reason: "" };

    case "approvals":
      if (!flags?.approvalQueue) {
        return {
          allowed: false,
          reason:
            "صف تأیید پشت پرچم محصول خاموش است (ENABLE_APPROVAL_STEPS / approvalQueue).",
        };
      }
      if (role != null && role !== "" && !isExpenseApproverRole(role)) {
        return {
          allowed: false,
          reason:
            "اقدامات تأیید فقط برای مالک، ادمین، مادرخرج یا تأییدکننده فعال است.",
        };
      }
      return { allowed: true, reason: "" };

    case "securityOps":
      if (!flags?.securityOpsV1) {
        return {
          allowed: false,
          reason:
            "صفحهٔ امنیت فقط وقتی ضدتقلب یا تأیید دو نفره روشن باشد در دسترس است.",
        };
      }
      if (
        role != null &&
        role !== "" &&
        role !== "owner" &&
        role !== "admin" &&
        role !== "finance"
      ) {
        return {
          allowed: false,
          reason: "رویدادهای امنیتی فضا فقط برای مالک، ادمین یا مالی قابل مشاهده است.",
        };
      }
      return { allowed: true, reason: "" };

    case "ledger":
      if (kind === "personal") {
        return {
          allowed: false,
          reason:
            "دفتر روزانه گروهی در فضای شخصی نیست. از تب «فضا» برای دفتر شخصی استفاده کنید.",
        };
      }
      if (!has("expenses")) {
        return { allowed: false, reason: "ماژول مالی برای این قالب فعال نیست." };
      }
      return { allowed: true, reason: "" };

    case "subunits":
      if (kind !== "building" && kind !== "org") {
        return {
          allowed: false,
          reason:
            "واحدها برای ساختمان و بخش‌ها برای سازمان‌اند — در فضای شخصی/گروهی از اعضا استفاده کنید.",
        };
      }
      return { allowed: true, reason: "" };

    case "metrics":
      if (!flags?.platformConsole) {
        return {
          allowed: false,
          reason:
            "شاخص‌های محصول فقط برای مدیر سامانه قابل مشاهده است.",
        };
      }
      return { allowed: true, reason: "" };

    case "jobs":
      if (!flags?.jobsAvailable && !flags?.jobsRedisQueue) {
        return {
          allowed: false,
          reason:
            "صف کارها فقط وقتی پردازش پس‌زمینه در این محیط روشن باشد در دسترس است.",
        };
      }
      if (!flags?.platformConsole) {
        return {
          allowed: false,
          reason:
            "صف کارها فقط برای مدیر سامانه قابل مشاهده است.",
        };
      }
      return { allowed: true, reason: "" };

    case "audit":
      return { allowed: true, reason: "" };

    default:
      return { allowed: true, reason: "" };
  }
}
