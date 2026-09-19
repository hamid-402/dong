import type { NeedStatus, PurchaseOrderStatus, PurchaseRequestStatus } from "./procurement.js";

const PR_TRANSITIONS: Record<PurchaseRequestStatus, readonly PurchaseRequestStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected"],
  approved: ["ordered"],
  rejected: [],
  ordered: [],
  cancelled: [],
};

const PO_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  open: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const NEED_TRANSITIONS: Record<NeedStatus, readonly NeedStatus[]> = {
  open: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function canTransitionPrStatus(
  from: PurchaseRequestStatus,
  to: PurchaseRequestStatus,
): boolean {
  return PR_TRANSITIONS[from].includes(to);
}

export function canTransitionPoStatus(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return PO_TRANSITIONS[from].includes(to);
}

export function canTransitionNeedStatus(from: NeedStatus, to: NeedStatus): boolean {
  return NEED_TRANSITIONS[from].includes(to);
}

export function assertPrTransition(
  from: PurchaseRequestStatus,
  to: PurchaseRequestStatus,
): void {
  if (!canTransitionPrStatus(from, to)) {
    throw new Error("PR_STATUS");
  }
}

export function assertPoTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): void {
  if (!canTransitionPoStatus(from, to)) {
    throw new Error("PO_STATUS");
  }
}

export function assertNeedTransition(from: NeedStatus, to: NeedStatus): void {
  if (!canTransitionNeedStatus(from, to)) {
    throw new Error("NEED_STATUS");
  }
}
