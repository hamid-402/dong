import type { ExpenseVisibility } from "./billing.js";

/**
 * Why an expense could not be committed straight away. Surfaced to the UI so
 * the message is a real server decision instead of a client guess.
 */
export type PostingHoldReason =
  | "requires_approval"
  | "over_approval_threshold"
  | "receipt_required"
  | "company_needs_approver_role"
  | "four_eyes";

export type PostingDecision = {
  /** `post` = write to the ledger now; `await_approval` = stop at submitted. */
  commit: "post" | "await_approval";
  reasons: PostingHoldReason[];
};

export type PostingDecisionInput = {
  totalMinor: string;
  visibility: ExpenseVisibility;
  /** Expense already flagged as needing approval (policy or company default). */
  requiresApproval: boolean;
  /** Set once an approver signed off. */
  approved: boolean;
  /** Workspace policy: null disables the gate. */
  approvalThresholdMinor?: string | null;
  requireReceiptAboveMinor?: string | null;
  /** Category ids that always require a receipt. */
  requireReceiptCategoryIds?: readonly string[] | null;
  /** Expense category id when set. */
  categoryId?: string | null;
  hasReceipt?: boolean;
  /** Maker-checker band; the maker may not self-clear above it. */
  makerCheckerThresholdMinor?: string | null;
  /** True when the actor is allowed to post company expenses. */
  actorCanPostCompany?: boolean;
  /** True when creator and actor are the same person. */
  actorIsMaker?: boolean;
};

function atOrAbove(amountMinor: string, thresholdMinor?: string | null): boolean {
  if (thresholdMinor === null || thresholdMinor === undefined) return false;
  const threshold = thresholdMinor.trim();
  if (!threshold) return false;
  try {
    return BigInt(amountMinor) >= BigInt(threshold);
  } catch {
    return false;
  }
}

/**
 * Single server-side rule for “can this expense hit the ledger right now?”.
 * Pure so the whole policy matrix is testable without a database.
 */
export function resolvePostingDecision(
  input: PostingDecisionInput,
): PostingDecision {
  const reasons: PostingHoldReason[] = [];

  const categoryNeedsReceipt =
    Boolean(input.categoryId) &&
    (input.requireReceiptCategoryIds ?? []).includes(input.categoryId!);
  if (
    (atOrAbove(input.totalMinor, input.requireReceiptAboveMinor) || categoryNeedsReceipt) &&
    !input.hasReceipt
  ) {
    reasons.push("receipt_required");
  }

  if (!input.approved) {
    if (input.requiresApproval) reasons.push("requires_approval");
    if (atOrAbove(input.totalMinor, input.approvalThresholdMinor)) {
      reasons.push("over_approval_threshold");
    }
    if (
      input.actorIsMaker &&
      atOrAbove(input.totalMinor, input.makerCheckerThresholdMinor)
    ) {
      reasons.push("four_eyes");
    }
  }

  if (
    input.visibility === "company" &&
    input.actorCanPostCompany === false
  ) {
    reasons.push("company_needs_approver_role");
  }

  const unique = [...new Set(reasons)];
  return {
    commit: unique.length === 0 ? "post" : "await_approval",
    reasons: unique,
  };
}

/** Persian explanation for the UI — one line, no invented claims. */
export function postingHoldMessageFa(reasons: readonly PostingHoldReason[]): string {
  if (reasons.length === 0) return "روی مانده اعضا اعمال شد";
  if (reasons.includes("receipt_required")) {
    return "برای این مبلغ رسید لازم است؛ پس از پیوست رسید ثبت نهایی می‌شود";
  }
  if (reasons.includes("four_eyes")) {
    return "ثبت‌کننده نمی‌تواند خودش تأیید کند؛ در انتظار تأیید نفر دوم";
  }
  if (reasons.includes("company_needs_approver_role")) {
    return "ثبت نهایی خرج شرکتی با نقش تأییدکننده انجام می‌شود";
  }
  return "در انتظار تأیید مدیر مالی";
}
