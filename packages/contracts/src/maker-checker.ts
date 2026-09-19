/**
 * Maker-checker / four-eyes helpers (R10-25) and light anomaly guards (R10-17).
 * Phase 2.3 adds multi-level approval tiers (additive; four-eyes gate unchanged).
 */

export function meetsMakerCheckerThreshold(
  amountMinor: string,
  thresholdMinor: string | null | undefined,
): boolean {
  if (thresholdMinor == null || thresholdMinor.trim() === "") return false;
  try {
    return BigInt(amountMinor) >= BigInt(thresholdMinor.trim());
  } catch {
    return false;
  }
}

export type MakerCheckerEvaluation = {
  required: boolean;
  allowed: boolean;
  code?: "FOUR_EYES_REQUIRED";
};

/** When amount ≥ threshold, maker and checker must be different users. */
export function evaluateMakerChecker(input: {
  amountMinor: string;
  thresholdMinor: string | null | undefined;
  makerUserId: string;
  checkerUserId: string;
}): MakerCheckerEvaluation {
  const required = meetsMakerCheckerThreshold(
    input.amountMinor,
    input.thresholdMinor,
  );
  if (!required) return { required: false, allowed: true };
  if (input.makerUserId.trim() === input.checkerUserId.trim()) {
    return { required: true, allowed: false, code: "FOUR_EYES_REQUIRED" };
  }
  return { required: true, allowed: true };
}

/** Amount-banded approval matrix (Phase 2.3). */
export type ApprovalTier = {
  minAmountMinor: string;
  requiredApprovals: number;
  requiredRoles?: string[];
};

/** Default IRR-minor tiers from consolidated roadmap. */
export const DEFAULT_APPROVAL_TIERS: ApprovalTier[] = [
  { minAmountMinor: "0", requiredApprovals: 1 },
  { minAmountMinor: "10000000", requiredApprovals: 2 },
  {
    minAmountMinor: "100000000",
    requiredApprovals: 2,
    requiredRoles: ["owner", "finance"],
  },
];

/** Roadmap alias. */
export const DEFAULT_TIERS = DEFAULT_APPROVAL_TIERS;

/** Parse workspace policy JSON; null = use DEFAULT_APPROVAL_TIERS. Invalid JSON → null. */
export function parseWorkspaceApprovalTiers(
  raw: string | null | undefined,
): ApprovalTier[] | null {
  if (raw == null || !raw.trim()) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const tiers: ApprovalTier[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      minAmountMinor?: unknown;
      requiredApprovals?: unknown;
      requiredRoles?: unknown;
    };
    if (typeof row.minAmountMinor !== "string" || !/^\d+$/.test(row.minAmountMinor)) {
      continue;
    }
    if (
      typeof row.requiredApprovals !== "number" ||
      !Number.isInteger(row.requiredApprovals) ||
      row.requiredApprovals < 1 ||
      row.requiredApprovals > 10
    ) {
      continue;
    }
    const requiredRoles =
      Array.isArray(row.requiredRoles) &&
      row.requiredRoles.every((r) => typeof r === "string" && r.trim().length > 0)
        ? row.requiredRoles.map((r) => String(r).trim())
        : undefined;
    tiers.push({
      minAmountMinor: row.minAmountMinor,
      requiredApprovals: row.requiredApprovals,
      requiredRoles,
    });
  }
  return tiers.length > 0 ? tiers : null;
}

export function serializeWorkspaceApprovalTiers(
  tiers: readonly ApprovalTier[] | null | undefined,
): string | null {
  if (tiers == null) return null;
  if (tiers.length === 0) return null;
  return JSON.stringify(tiers);
}

/** Highest tier whose minAmountMinor ≤ amount. */
export function resolveApprovalTier(
  amountMinor: string,
  tiers: readonly ApprovalTier[] = DEFAULT_APPROVAL_TIERS,
): ApprovalTier {
  if (tiers.length === 0) {
    return { minAmountMinor: "0", requiredApprovals: 1 };
  }
  let amount: bigint;
  try {
    amount = BigInt(amountMinor);
  } catch {
    return tiers[0]!;
  }
  const sorted = [...tiers].sort(
    (a, b) => Number(BigInt(a.minAmountMinor) - BigInt(b.minAmountMinor)),
  );
  let matched = sorted[0]!;
  for (const tier of sorted) {
    try {
      if (amount >= BigInt(tier.minAmountMinor)) matched = tier;
    } catch {
      /* skip bad tier */
    }
  }
  return matched;
}

export type TierApprovalEvaluation = {
  tier: ApprovalTier;
  allowed: boolean;
  status: "pending" | "complete" | "rejected";
  approvalsCount: number;
  requiredApprovals: number;
  code?:
    | "FOUR_EYES_REQUIRED"
    | "ROLE_REQUIRED"
    | "ALREADY_DECIDED"
    | "REJECTED";
};

/**
 * Evaluate whether a new approval advances / completes a multi-approval request.
 * Does not persist — callers append decisions then re-evaluate.
 */
export function evaluateTierApproval(input: {
  amountMinor: string;
  makerUserId: string;
  approverUserId: string;
  approverRoles: readonly string[];
  decision: "approved" | "rejected";
  /** Prior approved decisions by other users (distinct approver ids). */
  priorApprovedUserIds: readonly string[];
  tiers?: readonly ApprovalTier[];
}): TierApprovalEvaluation {
  const tier = resolveApprovalTier(input.amountMinor, input.tiers);
  const requiredApprovals = Math.max(1, tier.requiredApprovals);

  if (input.makerUserId.trim() === input.approverUserId.trim()) {
    return {
      tier,
      allowed: false,
      status: "pending",
      approvalsCount: input.priorApprovedUserIds.length,
      requiredApprovals,
      code: "FOUR_EYES_REQUIRED",
    };
  }

  if (tier.requiredRoles?.length) {
    const roles = new Set(input.approverRoles.map((r) => r.trim().toLowerCase()));
    const ok = tier.requiredRoles.some((r) => roles.has(r.trim().toLowerCase()));
    if (!ok) {
      return {
        tier,
        allowed: false,
        status: "pending",
        approvalsCount: input.priorApprovedUserIds.length,
        requiredApprovals,
        code: "ROLE_REQUIRED",
      };
    }
  }

  if (input.decision === "rejected") {
    return {
      tier,
      allowed: true,
      status: "rejected",
      approvalsCount: input.priorApprovedUserIds.length,
      requiredApprovals,
      code: "REJECTED",
    };
  }

  const prior = new Set(
    input.priorApprovedUserIds.map((id) => id.trim()).filter(Boolean),
  );
  if (prior.has(input.approverUserId.trim())) {
    const count = prior.size;
    return {
      tier,
      allowed: true,
      status: count >= requiredApprovals ? "complete" : "pending",
      approvalsCount: count,
      requiredApprovals,
      code: "ALREADY_DECIDED",
    };
  }

  const approvalsCount = prior.size + 1;
  return {
    tier,
    allowed: true,
    status: approvalsCount >= requiredApprovals ? "complete" : "pending",
    approvalsCount,
    requiredApprovals,
  };
}

export type SettlementAnomalyEvaluation = {
  ok: boolean;
  reasons: string[];
};

/** Lightweight antifraud heuristics for settlement create (R10-17 برش). */
export function evaluateSettlementAnomaly(input: {
  amountMinor: string;
  fromUserId: string;
  toUserId: string;
}): SettlementAnomalyEvaluation {
  const reasons: string[] = [];
  if (input.fromUserId.trim() === input.toUserId.trim()) {
    reasons.push("SELF_TRANSFER");
  }
  try {
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) reasons.push("NON_POSITIVE");
    // > 1e15 IRR minor ≈ absurd for local ops smoke
    if (amount > 1_000_000_000_000_000n) reasons.push("AMOUNT_TOO_LARGE");
  } catch {
    reasons.push("AMOUNT_INVALID");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Soft caps for invite flood heuristics (R10-17 برش دعوت). */
export const INVITE_PENDING_FLOOD_LIMIT = 20;
export const INVITE_ELEVATED_PENDING_LIMIT = 5;
/** Schema allows up to 720h; anomaly soft-blocks beyond 7 days. */
export const INVITE_ANOMALY_MAX_EXPIRY_HOURS = 168;

export type InviteAnomalyEvaluation = {
  ok: boolean;
  reasons: string[];
};

export type InviteAnomalyInviteRow = {
  role: string;
  acceptedAt?: string | null;
  expiresAt: string;
};

/** Count unaccepted, unexpired invites for flood heuristics. */
export function countOpenInvites(
  invites: readonly InviteAnomalyInviteRow[],
  nowMs = Date.now(),
): { open: number; elevatedOpen: number } {
  let open = 0;
  let elevatedOpen = 0;
  for (const inv of invites) {
    if (inv.acceptedAt) continue;
    const exp = Date.parse(inv.expiresAt);
    if (!Number.isFinite(exp) || exp <= nowMs) continue;
    open += 1;
    if (inv.role === "admin" || inv.role === "finance") elevatedOpen += 1;
  }
  return { open, elevatedOpen };
}

function looksLikeInviteEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Lightweight antifraud heuristics for invite create (R10-17 برش دعوت).
 * Does not log or require PII — callers must omit subject from security attrs.
 */
export function evaluateInviteAnomaly(input: {
  role: string;
  invitedSubject?: string | null;
  expiresInHours?: number | null;
  pendingOpenCount: number;
  pendingElevatedCount: number;
  /** Compare for SUBJECT_SELF only; never emit this value. */
  actorExternalSubject?: string | null;
}): InviteAnomalyEvaluation {
  const reasons: string[] = [];
  const subject = input.invitedSubject?.trim() ?? "";
  const elevated = input.role === "admin" || input.role === "finance";

  if (subject) {
    if (!looksLikeInviteEmail(subject)) {
      reasons.push("SUBJECT_INVALID");
    }
    const actorSub = input.actorExternalSubject?.trim().toLowerCase() ?? "";
    if (actorSub && subject.toLowerCase() === actorSub) {
      reasons.push("SUBJECT_SELF");
    }
  } else if (elevated) {
    reasons.push("ROLE_SENSITIVE_NO_SUBJECT");
  }

  if (
    input.expiresInHours != null &&
    Number.isFinite(input.expiresInHours) &&
    input.expiresInHours > INVITE_ANOMALY_MAX_EXPIRY_HOURS
  ) {
    reasons.push("EXPIRY_TOO_LONG");
  }

  if (input.pendingOpenCount >= INVITE_PENDING_FLOOD_LIMIT) {
    reasons.push("PENDING_FLOOD");
  }
  if (elevated && input.pendingElevatedCount >= INVITE_ELEVATED_PENDING_LIMIT) {
    reasons.push("PENDING_ELEVATED_FLOOD");
  }

  return { ok: reasons.length === 0, reasons };
}
