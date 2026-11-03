import type {
  ProductMetricCounts,
  ProductMetricMilestone,
  WorkspaceProductMetricsResponse,
} from "@dang/contracts";
import type { AuditRecord } from "./audit.types.js";

const ACTIONS = {
  workspaceCreate: "workspace.create",
  inviteCreate: "invite.create",
  inviteAccept: "invite.accept",
  expenseDraft: "expense.draft.create",
  expensePost: "expense.post",
  pettyCashDeposit: "petty_cash.deposit_credit",
  settlementClaim: "settlement.claim.create",
  settlementConfirm: "settlement.claim.confirm",
} as const;

function successEvents(events: AuditRecord[], action: string): AuditRecord[] {
  return events.filter((e) => e.action === action && e.result === "success");
}

function milestone(events: AuditRecord[], action: string): ProductMetricMilestone {
  const matched = successEvents(events, action).sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const first = matched[0];
  return {
    reached: matched.length > 0,
    firstAt: first?.occurredAt ?? null,
    sourceAction: action,
  };
}

function conversion(
  events: AuditRecord[],
  fromAction: string,
  toAction: string,
): WorkspaceProductMetricsResponse["conversions"]["inviteAcceptPerCreate"] {
  const fromCount = successEvents(events, fromAction).length;
  if (fromCount <= 0) return null;
  return {
    fromAction,
    toAction,
    fromCount,
    toCount: successEvents(events, toAction).length,
  };
}

/** Pure aggregation — unit-tested; no invented rates. */
export function aggregateWorkspaceProductMetrics(
  workspaceId: string,
  events: AuditRecord[],
  auditPersistence: "memory" | "postgres",
): WorkspaceProductMetricsResponse {
  const counts: ProductMetricCounts = {
    workspaceCreates: successEvents(events, ACTIONS.workspaceCreate).length,
    inviteCreates: successEvents(events, ACTIONS.inviteCreate).length,
    inviteAccepts: successEvents(events, ACTIONS.inviteAccept).length,
    expensePosts: successEvents(events, ACTIONS.expensePost).length,
    expenseDrafts: successEvents(events, ACTIONS.expenseDraft).length,
    pettyCashDeposits: successEvents(events, ACTIONS.pettyCashDeposit).length,
    settlementClaims: successEvents(events, ACTIONS.settlementClaim).length,
    settlementConfirms: successEvents(events, ACTIONS.settlementConfirm).length,
  };

  return {
    workspaceId,
    auditPersistence,
    eventCount: events.length,
    counts,
    milestones: {
      onboardingWorkspaceCreated: milestone(events, ACTIONS.workspaceCreate),
      inviteCreated: milestone(events, ACTIONS.inviteCreate),
      inviteAccepted: milestone(events, ACTIONS.inviteAccept),
      expenseDraftCreated: milestone(events, ACTIONS.expenseDraft),
      firstExpensePosted: milestone(events, ACTIONS.expensePost),
      pettyCashDeposited: milestone(events, ACTIONS.pettyCashDeposit),
      settlementClaimed: milestone(events, ACTIONS.settlementClaim),
      settlementCompleted: milestone(events, ACTIONS.settlementConfirm),
    },
    conversions: {
      inviteAcceptPerCreate: conversion(events, ACTIONS.inviteCreate, ACTIONS.inviteAccept),
      expensePostPerDraft: conversion(events, ACTIONS.expenseDraft, ACTIONS.expensePost),
      settlementConfirmPerClaim: conversion(
        events,
        ACTIONS.settlementClaim,
        ACTIONS.settlementConfirm,
      ),
    },
  };
}
