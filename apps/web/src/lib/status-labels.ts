/** Persian labels for API enum statuses — no raw English in UI. */

function labelFrom(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

const EXPENSE: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  posted: "ثبت‌شده",
  void: "باطل",
  reversed: "برگشت‌خورده",
};

const SETTLEMENT: Record<string, string> = {
  claimed: "در انتظار تأیید",
  confirmed: "تأییدشده",
  disputed: "اعتراض",
  cancelled: "لغوشده",
};

const INVOICE: Record<string, string> = {
  pending_approval: "در انتظار تأیید",
  approved: "تأییدشده",
  disputed: "اعتراض",
  issued: "صادرشده",
  paid: "پرداخت‌شده",
  cancelled: "لغوشده",
};

const PERIOD: Record<string, string> = {
  open: "باز",
  closed: "بسته",
  cancelled: "لغوشده",
};

const NEED: Record<string, string> = {
  open: "باز",
  fulfilled: "برآورده",
  cancelled: "لغوشده",
};

const PROPOSAL: Record<string, string> = {
  open: "باز",
  accepted: "پذیرفته",
  rejected: "ردشده",
  withdrawn: "لغوشده",
};

const PURCHASE_REQUEST: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  approved: "تأییدشده",
  rejected: "ردشده",
  ordered: "سفارش‌داده",
  cancelled: "لغوشده",
};

const PURCHASE_ORDER: Record<string, string> = {
  open: "باز",
  partially_delivered: "تحویل جزئی",
  delivered: "تحویل کامل",
  cancelled: "لغوشده",
};

const DELIVERY: Record<string, string> = {
  complete: "کامل",
  partial: "جزئی",
  discrepancy: "مغایرت",
};

const ASSET: Record<string, string> = {
  active: "فعال",
  returned: "برگشتی",
  damaged: "آسیب‌دیده",
  retired: "از رده خارج",
  in_use: "در استفاده",
  maintenance: "تعمیر",
  reserved: "رزرو",
  lost: "مفقود",
};

const AGREEMENT: Record<string, string> = {
  draft: "پیش‌نویس",
  active: "فعال",
  superseded: "جایگزین‌شده",
  closed: "بسته",
  signed: "امضاشده",
  terminated: "فسخ‌شده",
};

const WORKSPACE_TEMPLATE: Record<string, string> = {
  personal: "فضای شخصی",
  friends_family: "گروه دوستانه",
  household: "گروه خانواده",
  project_partners: "شرکای پروژه",
  small_team: "تیم / شرکت کوچک",
  construction: "ساختمان و پیمانکاری",
};

const AUTH_MODE: Record<string, string> = {
  dev: "حالت توسعه",
  password: "ورود با رمز",
  oidc: "ورود سازمانی",
};

const AUDIT_RESULT: Record<string, string> = {
  success: "موفق",
  failure: "ناموفق",
  denied: "رد شده",
};

export function expenseStatusLabel(status: string): string {
  return labelFrom(EXPENSE, status);
}

export function settlementStatusLabel(status: string): string {
  return labelFrom(SETTLEMENT, status);
}

export function invoiceStatusLabel(status: string): string {
  return labelFrom(INVOICE, status);
}

export function periodStatusLabel(status: string): string {
  return labelFrom(PERIOD, status);
}

export function needStatusLabel(status: string): string {
  return labelFrom(NEED, status);
}

export function proposalStatusLabel(status: string): string {
  return labelFrom(PROPOSAL, status);
}

export function purchaseRequestStatusLabel(status: string): string {
  return labelFrom(PURCHASE_REQUEST, status);
}

export function purchaseOrderStatusLabel(status: string): string {
  return labelFrom(PURCHASE_ORDER, status);
}

export function deliveryStatusLabel(status: string): string {
  return labelFrom(DELIVERY, status);
}

export function assetStatusLabel(status: string): string {
  return labelFrom(ASSET, status);
}

export function agreementStatusLabel(status: string): string {
  return labelFrom(AGREEMENT, status);
}

export function workspaceTemplateLabel(template: string): string {
  return labelFrom(WORKSPACE_TEMPLATE, template);
}

export function spaceKindForTemplateLabel(kind: "personal" | "group" | "org"): string {
  if (kind === "personal") return "شخصی";
  if (kind === "org") return "سازمانی";
  return "گروهی";
}

export function authModeLabel(mode: string): string {
  return labelFrom(AUTH_MODE, mode);
}

export function auditResultLabel(result: string): string {
  return labelFrom(AUDIT_RESULT, result);
}

export function expenseVisibilityLabel(visibility: string): string {
  if (visibility === "private") return "خصوصی";
  if (visibility === "company") return "شرکتی";
  return "جمعی";
}

export function membershipRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "owner":
      return "مالک";
    case "admin":
      return "ادمین";
    case "finance":
      return "مادرخرج / مدیر مالی";
    case "approver":
      return "تأییدکننده";
    case "buyer":
      return "خریدار";
    case "asset_custodian":
      return "امانت‌دار تجهیزات";
    case "member":
      return "عضو";
    case "auditor":
      return "ناظر";
    case "guest":
      return "مهمان";
    default:
      return role?.trim() ? role : "بدون نقش";
  }
}

export function recurringCadenceLabel(cadence: string): string {
  if (cadence === "weekly") return "هفتگی";
  if (cadence === "monthly") return "ماهانه";
  if (cadence === "yearly") return "سالانه";
  return cadence;
}

export function paymentLinkStatusLabel(status: string): string {
  if (status === "pending") return "در انتظار";
  if (status === "paid" || status === "completed") return "پرداخت‌شده";
  if (status === "failed") return "ناموفق";
  if (status === "cancelled" || status === "canceled") return "لغو";
  if (status === "expired") return "منقضی";
  return status;
}

export function periodKindLabel(kind: string): string {
  if (kind === "month") return "ماه";
  if (kind === "week") return "هفته";
  if (kind === "year") return "سال";
  if (kind === "custom") return "بازه سفارشی";
  return kind;
}

export function approvalQueueKindLabel(kind: string): string {
  if (kind === "expense") return "خرج";
  if (kind === "member_invoice") return "صورتحساب";
  if (kind === "addon_charge") return "اضافه شخصی";
  return kind;
}

export function approvalQueueStatusLabel(status: string): string {
  if (status === "pending_ack") return "در انتظار تأیید";
  if (status === "submitted") return "ارسال‌شده";
  if (status === "draft") return "پیش‌نویس";
  if (status === "pending_approval") return "در انتظار تأیید";
  if (status.startsWith("step_") && status.endsWith("_pending")) {
    const n = status.replace(/^step_/, "").replace(/_pending$/, "");
    return `گام ${n} در انتظار`;
  }
  return status;
}

export function settlementClaimStatusLabel(status: string): string {
  return settlementStatusLabel(status);
}

export function personalExportStatusLabel(status: string): string {
  if (status === "pending") return "در صف";
  if (status === "completed") return "آماده";
  if (status === "failed") return "ناموفق";
  return status;
}

export function zeroSumHint(zeroSum: boolean): string {
  return zeroSum ? "مانده اعضا متعادل است" : "مانده اعضا متعادل نیست";
}

export function persistenceLabelFa(
  persistence:
    | {
        iam: string;
        ledger: string;
        expense: string;
        personalFinance?: string;
      }
    | undefined,
  databaseConfigured: boolean,
): string {
  if (!persistence) return "در حال بارگذاری…";
  if (!databaseConfigured) return "بدون اتصال پایگاه";
  const durable =
    persistence.iam === "postgres" &&
    persistence.ledger === "postgres" &&
    persistence.expense === "postgres" &&
    (persistence.personalFinance == null || persistence.personalFinance === "postgres");
  return durable ? "ذخیره‌سازی پایدار" : "حافظه موقت (توسعه)";
}
