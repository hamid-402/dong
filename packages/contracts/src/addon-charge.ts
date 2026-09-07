import type { Money } from "./money.js";

/** Dong 2.0 personal add-on within a group (Wave 1 skeleton / Wave 2 FSM). */
export type AddonChargeStatus = "pending_ack" | "confirmed" | "disputed";

export type PersonalAddonChargeSummary = {
  id: string;
  workspaceId: string;
  targetMemberUserId: string;
  createdByUserId: string;
  amount: Money;
  title: string;
  note?: string;
  categoryId?: string;
  linkedExpenseId?: string;
  status: AddonChargeStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreatePersonalAddonChargeRequest = {
  targetMemberUserId: string;
  amount: Money;
  title: string;
  note?: string;
  categoryId?: string;
  linkedExpenseId?: string;
  idempotencyKey: string;
};

export type DisputePersonalAddonChargeRequest = {
  note?: string;
};
