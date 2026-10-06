/**
 * RBAC + light ABAC evaluator (R10-05).
 * Attributes: visibility, ownership, resource status — not a full policy DSL.
 *
 * Policy version history:
 * - rbac_abac_v1 — hot-path actions (approve/confirm/invite/saas/dlq/private read)
 * - rbac_abac_v2 — finance mutations unified under requireAccess (expense.create,
 *   settlement.claim, finance.manage); grants still layer first in WorkspaceAccessService
 * - rbac_abac_v3 — statement.read_self|read_any|export + payout.manage
 * - rbac_abac_v4 — settlement.dispute; requireAccess also runs Policy DSL built-ins
 * - rbac_abac_v5 — deputy finance approvalCapMinor enforced when amountMinor present
 */

import {
  EXPENSE_APPROVER_ROLES,
  INVITE_ADMIN_ROLES,
  JOBS_DLQ_ROLES,
  RANGE_LOCK_ROLES,
  roleInSet,
} from "./access-policy.js";

export const ACCESS_POLICY_VERSION = "rbac_abac_v5" as const;

export type AccessAction =
  | "workspace.mutate"
  | "expense.create"
  | "expense.read_private"
  | "expense.approve"
  | "settlement.claim"
  | "settlement.confirm"
  | "settlement.dispute"
  | "invite.create"
  | "finance.manage"
  | "saas.invoice.manage"
  | "jobs.dlq"
  | "statement.read_self"
  | "statement.read_any"
  | "statement.export"
  | "payout.manage";

export type AccessResourceAttrs = {
  visibility?: "shared" | "private" | "company";
  ownerUserId?: string;
  /** Expense/settlement lifecycle status when relevant. */
  status?: string;
  amountMinor?: string;
  /** Settlement party membership for dispute/confirm ABAC + Policy DSL. */
  isParty?: boolean;
  /** Explicit self flag for statement.export; else derived from ownerUserId. */
  isSelf?: boolean;
};

export type AccessDecision = {
  allowed: boolean;
  code: "ALLOW" | "DENY_ROLE" | "DENY_ATTRIBUTE" | "DENY_OWNERSHIP";
  action: AccessAction;
  reason: string;
  policyVersion: typeof ACCESS_POLICY_VERSION;
};

function isReadOnly(role: string | null | undefined): boolean {
  return role === "auditor" || role === "guest";
}

function isFinanceManager(role: string | null | undefined): boolean {
  return roleInSet(role, RANGE_LOCK_ROLES);
}

function allow(action: AccessAction, reason: string): AccessDecision {
  return {
    action,
    policyVersion: ACCESS_POLICY_VERSION,
    allowed: true,
    code: "ALLOW",
    reason,
  };
}

function denyRole(action: AccessAction, reason: string): AccessDecision {
  return {
    action,
    policyVersion: ACCESS_POLICY_VERSION,
    allowed: false,
    code: "DENY_ROLE",
    reason,
  };
}

function denyAttr(action: AccessAction, reason: string): AccessDecision {
  return {
    action,
    policyVersion: ACCESS_POLICY_VERSION,
    allowed: false,
    code: "DENY_ATTRIBUTE",
    reason,
  };
}

/**
 * Evaluate RBAC role sets plus attribute conditions.
 * Callers must still enforce tenant membership separately.
 * Grant layers (S11-04) are applied in WorkspaceAccessService before this evaluator.
 */
export function evaluateAccessPolicy(input: {
  role: string | null | undefined;
  action: AccessAction;
  subjectUserId?: string;
  resource?: AccessResourceAttrs;
}): AccessDecision {
  const { role, action, subjectUserId, resource } = input;

  if (!role) {
    return denyRole(action, "نقش عضویت مشخص نیست");
  }

  switch (action) {
    case "workspace.mutate":
    case "expense.create":
    case "settlement.claim": {
      if (isReadOnly(role)) {
        return denyRole(action, "نقش فقط‌خواندنی نمی‌تواند جهش کند");
      }
      return allow(
        action,
        action === "expense.create"
          ? "عضو جهش‌پذیر می‌تواند خرج بسازد"
          : action === "settlement.claim"
            ? "عضو جهش‌پذیر می‌تواند ادعای تسویه بسازد"
            : "عضو جهش‌پذیر",
      );
    }
    case "expense.read_private": {
      const ownerId = resource?.ownerUserId?.trim();
      if (isFinanceManager(role)) {
        return allow(action, "مدیر مالی می‌تواند خرج خصوصی را ببیند");
      }
      if (
        ownerId &&
        subjectUserId &&
        ownerId === subjectUserId.trim()
      ) {
        return allow(action, "مالک خرج خصوصی");
      }
      return {
        action,
        policyVersion: ACCESS_POLICY_VERSION,
        allowed: false,
        code: "DENY_OWNERSHIP",
        reason: "خرج خصوصی فقط برای مالک یا مدیر مالی",
      };
    }
    case "expense.approve": {
      if (!roleInSet(role, EXPENSE_APPROVER_ROLES)) {
        return denyRole(action, "نقش تأیید خرج را ندارد");
      }
      const status = resource?.status?.trim();
      if (status === "posted" || status === "reversed") {
        return denyAttr(action, `وضعیت خرج برای تأیید مجاز نیست (${status})`);
      }
      return allow(action, "نقش و وضعیت تأیید مجاز");
    }
    case "settlement.confirm": {
      if (isReadOnly(role)) {
        return denyRole(action, "نقش فقط‌خواندنی");
      }
      const status = resource?.status?.trim();
      if (status && status !== "claimed" && status !== "pending") {
        return denyAttr(
          action,
          `وضعیت تسویه برای تأیید مجاز نیست (${status})`,
        );
      }
      return allow(
        action,
        "عضو جهش‌پذیر می‌تواند تأیید کند (ACL طرفین جداست)",
      );
    }
    case "settlement.dispute": {
      if (isReadOnly(role)) {
        return denyRole(action, "نقش فقط‌خواندنی نمی‌تواند اعتراض کند");
      }
      if (isFinanceManager(role)) {
        return allow(action, "مدیر مالی می‌تواند به تسویه اعتراض کند");
      }
      if (resource?.isParty === true) {
        return allow(action, "طرف ادعا می‌تواند اعتراض کند");
      }
      if (resource?.isParty === false) {
        return {
          action,
          policyVersion: ACCESS_POLICY_VERSION,
          allowed: false,
          code: "DENY_OWNERSHIP",
          reason: "فقط طرفین ادعا یا مدیر مالی می‌توانند اعتراض کنند",
        };
      }
      return allow(
        action,
        "عضو جهش‌پذیر؛ ACL طرفین با isParty / سرویس تسویه",
      );
    }
    case "invite.create": {
      if (!roleInSet(role, INVITE_ADMIN_ROLES)) {
        return denyRole(action, "فقط owner/admin دعوت می‌سازد");
      }
      return allow(action, "ادمین دعوت");
    }
    case "finance.manage": {
      if (!isFinanceManager(role)) {
        return denyRole(action, "فقط مدیر مالی / مادرخرج");
      }
      return allow(action, "مدیر مالی");
    }
    case "saas.invoice.manage": {
      if (!isFinanceManager(role)) {
        return denyRole(action, "فقط مدیر مالی اشتراک را مدیریت می‌کند");
      }
      return allow(action, "مدیر مالی SaaS");
    }
    case "jobs.dlq": {
      if (!roleInSet(role, JOBS_DLQ_ROLES)) {
        return denyRole(action, "DLQ فقط برای ادمین فضا");
      }
      return allow(action, "ادمین DLQ");
    }
    case "statement.read_self": {
      return allow(action, "عضو می‌تواند صورتحساب سهم‌محور خود را ببیند");
    }
    case "statement.read_any": {
      if (isFinanceManager(role) || role === "auditor") {
        return allow(action, "مدیر مالی / حسابرس می‌تواند صورتحساب دیگران را ببیند");
      }
      return denyRole(action, "مشاهدهٔ صورتحساب دیگران نیاز به نقش مالی دارد");
    }
    case "statement.export": {
      const ownerId = resource?.ownerUserId?.trim();
      if (ownerId && subjectUserId && ownerId === subjectUserId.trim()) {
        return allow(action, "خروجی صورتحساب خود");
      }
      if (isFinanceManager(role) || role === "auditor") {
        return allow(action, "خروجی صورتحساب اعضا برای نقش مالی/حسابرس");
      }
      return denyRole(action, "خروجی صورتحساب دیگران مجاز نیست");
    }
    case "payout.manage": {
      if (role === "owner" || role === "admin") {
        return allow(action, "مالک/مدیر دستور واریز را مدیریت می‌کند");
      }
      return denyRole(action, "فقط owner/admin دستور واریز را تغییر می‌دهد");
    }
    default: {
      return denyRole(action, "عمل ناشناخته");
    }
  }
}
