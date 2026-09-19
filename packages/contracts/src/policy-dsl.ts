/**
 * Pure ABAC Policy DSL (Phase 3 / P3).
 * JSON policies with all/any conditions and attr ops — not a remote PDP.
 * Built-ins mirror real AccessAction / audit names where they exist.
 */

import {
  EXPENSE_APPROVER_ROLES,
  INVITE_ADMIN_ROLES,
  RANGE_LOCK_ROLES,
  WORKSPACE_ADMIN_ROLES,
} from "./access-policy.js";

export type PolicyEffect = "allow" | "deny";

export type PolicyAttrOp = "in" | "eq" | "lt" | "gte";

export type PolicyAttrValue = string | number | boolean | readonly string[];

export type PolicyAttrCondition = {
  attr: string;
  op: PolicyAttrOp;
  value: PolicyAttrValue;
};

export type PolicyCondition =
  | { all: readonly PolicyAttrCondition[] }
  | { any: readonly PolicyAttrCondition[] };

export type PolicyJson = {
  policyId: string;
  effect: PolicyEffect;
  /** Real action id when aligned (e.g. expense.approve, invite.create). */
  action: string;
  condition: PolicyCondition;
  /** Human-readable summary for audit export. */
  description: string;
};

export type PolicyContextAttrs = Record<
  string,
  string | number | boolean | null | undefined
>;

export type PolicyContext = {
  attrs: PolicyContextAttrs;
};

/**
 * Evaluate a single policy against context attrs.
 * - effect allow → true iff condition matches
 * - effect deny → true (permitted) iff condition does NOT match
 */
export function evaluatePolicy(
  policy: PolicyJson,
  context: PolicyContext,
): boolean {
  const matched = policyConditionMatches(policy.condition, context.attrs);
  return policy.effect === "allow" ? matched : !matched;
}

/**
 * Whether enough attrs are present to evaluate this policy without false denies
 * from missing resource context (skip when incomplete).
 * - `all`: every referenced attr must be present
 * - `any`: at least one branch attr must be present
 */
export function policyAttrsAvailable(
  policy: PolicyJson,
  attrs: PolicyContextAttrs,
): boolean {
  if ("all" in policy.condition) {
    return policy.condition.all.every(
      (c) => attrs[c.attr] !== undefined && attrs[c.attr] !== null,
    );
  }
  return policy.condition.any.some(
    (c) => attrs[c.attr] !== undefined && attrs[c.attr] !== null,
  );
}

export type BuiltInPolicyDecision =
  | { allowed: true }
  | { allowed: false; policyId: string; reason: string };

/**
 * Run matching BUILT_IN_POLICIES for an action when attrs are available.
 * Skips policies whose required attrs are incomplete.
 */
export function evaluateBuiltInPoliciesForAction(input: {
  action: string;
  attrs: PolicyContextAttrs;
}): BuiltInPolicyDecision {
  for (const policy of BUILT_IN_POLICIES) {
    if (policy.action !== input.action) continue;
    if (!policyAttrsAvailable(policy, input.attrs)) continue;
    if (!evaluatePolicy(policy, { attrs: input.attrs })) {
      return {
        allowed: false,
        policyId: policy.policyId,
        reason: `Policy DSL denied ${policy.action} (${policy.policyId})`,
      };
    }
  }
  return { allowed: true };
}

/**
 * AccessAction → Policy DSL action ids to enforce on requireAccess.
 * `expense.create` also checks `expense.reverse` (product delete maps to reverse).
 */
export function policyActionsForAccessAction(action: string): string[] {
  const actions = [action];
  if (action === "expense.create") actions.push("expense.reverse");
  return actions;
}

/** Build Policy DSL attrs from membership role + optional AccessResourceAttrs. */
export function buildPolicyContextAttrs(
  role: string,
  subjectUserId: string,
  resource?: {
    status?: string;
    ownerUserId?: string;
    isParty?: boolean;
    isSelf?: boolean;
  },
): PolicyContextAttrs {
  const attrs: PolicyContextAttrs = { role };
  if (resource?.status !== undefined) attrs.status = resource.status;
  if (resource?.isParty !== undefined) attrs.isParty = resource.isParty;
  if (resource?.isSelf !== undefined) {
    attrs.isSelf = resource.isSelf;
  } else if (resource?.ownerUserId !== undefined) {
    attrs.isSelf =
      subjectUserId.trim() === resource.ownerUserId.trim();
  }
  return attrs;
}

export function policyConditionMatches(
  condition: PolicyCondition,
  attrs: PolicyContextAttrs,
): boolean {
  if ("all" in condition) {
    return condition.all.every((c) => evaluateAttrCondition(c, attrs));
  }
  return condition.any.some((c) => evaluateAttrCondition(c, attrs));
}

function evaluateAttrCondition(
  cond: PolicyAttrCondition,
  attrs: PolicyContextAttrs,
): boolean {
  const raw = attrs[cond.attr];
  if (raw === undefined || raw === null) return false;

  switch (cond.op) {
    case "eq":
      return (
        normalizeScalar(raw) ===
        normalizeScalar(cond.value as string | number | boolean)
      );
    case "in": {
      if (!Array.isArray(cond.value)) return false;
      const needle = normalizeScalar(raw);
      return (cond.value as readonly string[]).some(
        (v) => normalizeScalar(v) === needle,
      );
    }
    case "lt":
    case "gte": {
      const left = toComparableNumber(raw);
      const right = toComparableNumber(cond.value);
      if (left === null || right === null) return false;
      return cond.op === "lt" ? left < right : left >= right;
    }
    default:
      return false;
  }
}

function normalizeScalar(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function toComparableNumber(
  v: string | number | boolean | readonly string[],
): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  try {
    return Number(BigInt(t));
  } catch {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
}

/** Roles that may mutate expenses (mirrors access-abac deny guest/auditor). */
const MUTABLE_MEMBER_ROLES = [
  "owner",
  "admin",
  "finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "deputy_finance",
] as const;

/**
 * Built-in registry — honest encoding of shipped access rules as DSL JSON.
 * Does not invent grants beyond role/attr sets already enforced in access-abac / services.
 */
export const BUILT_IN_POLICIES: readonly PolicyJson[] = [
  {
    policyId: "builtin.expense.approve",
    effect: "allow",
    action: "expense.approve",
    description:
      "تأیید خرج: نقش تأییدکننده + وضعیت draft|submitted (نه posted/reversed)",
    condition: {
      all: [
        {
          attr: "role",
          op: "in",
          value: [...EXPENSE_APPROVER_ROLES],
        },
        {
          attr: "status",
          op: "in",
          value: ["draft", "submitted"],
        },
      ],
    },
  },
  {
    policyId: "builtin.settlement.dispute",
    effect: "allow",
    /** Runtime audit event is settlement.claim.dispute; DSL verb is settlement.dispute. */
    action: "settlement.dispute",
    description:
      "اعتراض به تسویه: مدیر مالی یا طرفین ادعا (isParty=true) — هم‌تراز assertPartyAction",
    condition: {
      any: [
        {
          attr: "role",
          op: "in",
          value: [...RANGE_LOCK_ROLES],
        },
        {
          attr: "isParty",
          op: "eq",
          value: true,
        },
      ],
    },
  },
  {
    policyId: "builtin.expense.reverse",
    effect: "allow",
    /** Product “delete” maps to reverse; AccessAction gate is expense.create. */
    action: "expense.reverse",
    description:
      "حذف/برگشت خرج: عضو جهش‌پذیر (نه guest/auditor) — enforce از طریق expense.create",
    condition: {
      all: [
        {
          attr: "role",
          op: "in",
          value: [...MUTABLE_MEMBER_ROLES],
        },
      ],
    },
  },
  {
    policyId: "builtin.invite.create",
    effect: "allow",
    action: "invite.create",
    description: "ساخت دعوت: فقط owner/admin",
    condition: {
      all: [
        {
          attr: "role",
          op: "in",
          value: [...INVITE_ADMIN_ROLES],
        },
      ],
    },
  },
  {
    policyId: "builtin.statement.export",
    effect: "allow",
    action: "statement.export",
    description:
      "خروجی صورتحساب: مالک صورتحساب (isSelf) یا نقش مالی/حسابرس",
    condition: {
      any: [
        {
          attr: "isSelf",
          op: "eq",
          value: true,
        },
        {
          attr: "role",
          op: "in",
          value: [...RANGE_LOCK_ROLES, "auditor"],
        },
      ],
    },
  },
] as const;

export type PolicyAuditNote = {
  policyId: string;
  action: string;
  effect: PolicyEffect;
  description: string;
  /** Honest note for the actor's role against this built-in (no invented grants). */
  noteForActor: string;
  /** evaluatePolicy with role-only attrs (resource attrs omitted → may be false). */
  roleOnlyAllows: boolean;
};

export type PolicyAuditExport = {
  source: "builtin_registry";
  actorRole: string;
  policies: PolicyAuditNote[];
};

/**
 * Human-readable audit of active built-in policies for the actor's role.
 * Resource-dependent policies state that honestly when role alone is insufficient.
 */
export function exportBuiltInPolicyAudit(actorRole: string): PolicyAuditExport {
  const role = actorRole.trim();
  const policies = BUILT_IN_POLICIES.map((policy) => {
    const roleOnlyAllows = evaluatePolicy(policy, { attrs: { role } });
    return {
      policyId: policy.policyId,
      action: policy.action,
      effect: policy.effect,
      description: policy.description,
      noteForActor: noteForRole(policy, role, roleOnlyAllows),
      roleOnlyAllows,
    };
  });
  return {
    source: "builtin_registry",
    actorRole: role,
    policies,
  };
}

function noteForRole(
  policy: PolicyJson,
  role: string,
  roleOnlyAllows: boolean,
): string {
  switch (policy.policyId) {
    case "builtin.expense.approve": {
      const inSet = (EXPENSE_APPROVER_ROLES as readonly string[]).includes(role);
      if (!inSet) {
        return `نقش «${role}» در مجموعهٔ تأیید خرج نیست → deny نقش`;
      }
      return `نقش «${role}» در مجموعهٔ تأیید است؛ اجازهٔ نهایی به status∈{draft,submitted} هم بستگی دارد (role-only=${roleOnlyAllows})`;
    }
    case "builtin.settlement.dispute": {
      const finance = (RANGE_LOCK_ROLES as readonly string[]).includes(role);
      if (finance) {
        return `نقش «${role}» مدیر مالی است → dispute بدون نیاز به طرف بودن`;
      }
      return `نقش «${role}» مدیر مالی نیست؛ فقط اگر isParty=true (طرف ادعا) مجاز است`;
    }
    case "builtin.expense.reverse": {
      if (roleOnlyAllows) {
        return `نقش «${role}» جهش‌پذیر است → reverse/delete مسیر expense.create`;
      }
      return `نقش «${role}» فقط‌خواندنی/خارج از مجموعهٔ جهش → reverse مجاز نیست`;
    }
    case "builtin.invite.create": {
      const ok = (INVITE_ADMIN_ROLES as readonly string[]).includes(role);
      return ok
        ? `نقش «${role}» در ${WORKSPACE_ADMIN_ROLES.join("/")} → invite.create مجاز`
        : `نقش «${role}» دعوت نمی‌سازد (فقط owner/admin)`;
    }
    case "builtin.statement.export": {
      const elevated =
        (RANGE_LOCK_ROLES as readonly string[]).includes(role) ||
        role === "auditor";
      if (elevated) {
        return `نقش «${role}» می‌تواند خروجی صورتحساب اعضا را بگیرد`;
      }
      return `نقش «${role}» فقط خروجی صورتحساب خود (isSelf=true) را دارد`;
    }
    default:
      return roleOnlyAllows
        ? `نقش «${role}» با این policy هم‌خوان است`
        : `نقش «${role}» به‌تنهایی این policy را برقرار نمی‌کند`;
  }
}
