import type { MembershipRole, WorkspaceTemplate } from "@dang/contracts";

/** Role-aware danger-zone gating shared by UI + unit tests. */
export function dangerZoneActions(input: {
  template: WorkspaceTemplate;
  role: MembershipRole | null;
  archived: boolean;
}): {
  personalProtected: boolean;
  showLeave: boolean;
  showOwnerLifecycle: boolean;
  showUnarchive: boolean;
} {
  const personalProtected = input.template === "personal";
  if (personalProtected) {
    return {
      personalProtected: true,
      showLeave: false,
      showOwnerLifecycle: false,
      showUnarchive: false,
    };
  }
  const isOwner = input.role === "owner";
  const isMember = input.role != null && input.role !== "owner";
  return {
    personalProtected: false,
    showLeave: isMember,
    showOwnerLifecycle: isOwner,
    showUnarchive: isOwner && input.archived,
  };
}

export type LifecycleConsequence = {
  keep: string[];
  lose: string[];
};

export function leaveConsequences(): LifecycleConsequence {
  return {
    lose: [
      "دسترسی به خانه، خرج و تسویه این فضا",
      "نمایش فضا در فهرست و سوییچر",
      "دریافت اعلان‌های عملیاتی فضا",
    ],
    keep: [
      "ردپای خرج و تسویه در دفترکل",
      "audit trail برای بازیابی مدیریتی",
    ],
  };
}

export function archiveConsequences(): LifecycleConsequence {
  return {
    lose: [
      "نمایش فضا برای اعضا در فهرست",
      "امکان پیوستن تازه با شناسهٔ عمومی",
      "ویرایش مشخصات تا زمان بازگردانی",
    ],
    keep: [
      "عضویت‌ها و نقش‌ها",
      "دفترکل، audit و صورتحساب‌ها",
      "امکان بازگردانی توسط مالک",
    ],
  };
}

export function softDeleteConsequences(): LifecycleConsequence {
  return {
    lose: [
      "ظاهر شدن در همهٔ فهرست‌ها و deep-linkهای روزمره",
      "دعوت و پیوستن جدید",
      "عملیات مالی جدید روی این فضا",
    ],
    keep: [
      "رکورد soft-delete در پایگاه برای بازیابی سیستمی",
      "دفترکل تاریخی (بدون حذف سخت)",
    ],
  };
}

/** Live match for typed slug confirm — used by delete modal. */
export function slugConfirmState(
  typed: string,
  expectedSlug: string,
): "empty" | "mismatch" | "match" {
  const t = typed.trim().toLowerCase();
  if (!t) return "empty";
  if (t === expectedSlug.trim().toLowerCase()) return "match";
  return "mismatch";
}
