import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateWorkspaceProductMetrics } from "./product-metrics.js";
import type { AuditRecord } from "./audit.types.js";

function ev(
  partial: Pick<AuditRecord, "action" | "occurredAt"> & Partial<AuditRecord>,
): AuditRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    workspaceId: partial.workspaceId ?? "ws-1",
    action: partial.action,
    targetType: partial.targetType ?? "workspace",
    result: partial.result ?? "success",
    occurredAt: partial.occurredAt,
    actorUserId: partial.actorUserId ?? "u1",
    metadata: partial.metadata ?? {},
  };
}

test("aggregateWorkspaceProductMetrics counts only success actions", () => {
  const events: AuditRecord[] = [
    ev({ action: "workspace.create", occurredAt: "2026-01-01T00:00:00.000Z" }),
    ev({ action: "expense.post", occurredAt: "2026-01-02T00:00:00.000Z" }),
    ev({
      action: "expense.post",
      occurredAt: "2026-01-03T00:00:00.000Z",
      result: "failure",
    }),
    ev({
      action: "settlement.claim.confirm",
      occurredAt: "2026-01-04T00:00:00.000Z",
    }),
  ];

  const metrics = aggregateWorkspaceProductMetrics("ws-1", events, "memory");
  assert.equal(metrics.counts.workspaceCreates, 1);
  assert.equal(metrics.counts.expensePosts, 1);
  assert.equal(metrics.counts.settlementConfirms, 1);
  assert.equal(metrics.counts.inviteAccepts, 0);
  assert.equal(metrics.counts.inviteCreates, 0);
  assert.equal(metrics.milestones.firstExpensePosted.reached, true);
  assert.equal(
    metrics.milestones.firstExpensePosted.firstAt,
    "2026-01-02T00:00:00.000Z",
  );
  assert.equal(metrics.milestones.inviteAccepted.reached, false);
  assert.equal(metrics.conversions.inviteAcceptPerCreate, null);
  assert.equal(metrics.conversions.expensePostPerDraft, null);
  assert.equal(metrics.eventCount, 4);
  assert.equal(metrics.auditPersistence, "memory");
});

test("empty audit yields honest empty milestones", () => {
  const metrics = aggregateWorkspaceProductMetrics("ws-1", [], "postgres");
  assert.equal(metrics.eventCount, 0);
  assert.equal(metrics.milestones.onboardingWorkspaceCreated.reached, false);
  assert.equal(metrics.milestones.settlementCompleted.firstAt, null);
  assert.equal(metrics.conversions.expensePostPerDraft, null);
});

test("conversion counts drafts, posts, and deposits without copying metadata", () => {
  const events: AuditRecord[] = [
    ev({
      action: "expense.draft.create",
      occurredAt: "2026-02-01T00:00:00.000Z",
      metadata: { amountMinor: "900000", note: "secret" },
    }),
    ev({ action: "expense.draft.create", occurredAt: "2026-02-02T00:00:00.000Z" }),
    ev({ action: "expense.post", occurredAt: "2026-02-03T00:00:00.000Z" }),
    ev({ action: "petty_cash.deposit_credit", occurredAt: "2026-02-04T00:00:00.000Z" }),
    ev({ action: "invite.create", occurredAt: "2026-02-05T00:00:00.000Z" }),
    ev({ action: "invite.accept", occurredAt: "2026-02-06T00:00:00.000Z" }),
    ev({
      action: "settlement.claim.create",
      occurredAt: "2026-02-07T00:00:00.000Z",
      metadata: { amountMinor: "1000", fromUserId: "u1", toUserId: "u2" },
    }),
    ev({
      action: "settlement.claim.create",
      occurredAt: "2026-02-08T00:00:00.000Z",
    }),
    ev({
      action: "settlement.claim.confirm",
      occurredAt: "2026-02-09T00:00:00.000Z",
    }),
  ];
  const metrics = aggregateWorkspaceProductMetrics("ws-1", events, "postgres");
  assert.equal(metrics.counts.expenseDrafts, 2);
  assert.equal(metrics.counts.expensePosts, 1);
  assert.equal(metrics.counts.pettyCashDeposits, 1);
  assert.deepEqual(metrics.conversions.expensePostPerDraft, {
    fromAction: "expense.draft.create",
    toAction: "expense.post",
    fromCount: 2,
    toCount: 1,
  });
  assert.deepEqual(metrics.conversions.inviteAcceptPerCreate, {
    fromAction: "invite.create",
    toAction: "invite.accept",
    fromCount: 1,
    toCount: 1,
  });
  assert.equal(metrics.counts.settlementClaims, 2);
  assert.equal(metrics.counts.settlementConfirms, 1);
  assert.deepEqual(metrics.conversions.settlementConfirmPerClaim, {
    fromAction: "settlement.claim.create",
    toAction: "settlement.claim.confirm",
    fromCount: 2,
    toCount: 1,
  });
  const serialized = JSON.stringify(metrics);
  assert.equal(serialized.includes("900000"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("amountMinor"), false);
  assert.equal(serialized.includes("fromUserId"), false);
  assert.equal(serialized.includes("u2"), false);
});
