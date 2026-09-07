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
  assert.equal(metrics.milestones.firstExpensePosted.reached, true);
  assert.equal(
    metrics.milestones.firstExpensePosted.firstAt,
    "2026-01-02T00:00:00.000Z",
  );
  assert.equal(metrics.milestones.inviteAccepted.reached, false);
  assert.equal(metrics.eventCount, 4);
  assert.equal(metrics.auditPersistence, "memory");
});

test("empty audit yields honest empty milestones", () => {
  const metrics = aggregateWorkspaceProductMetrics("ws-1", [], "postgres");
  assert.equal(metrics.eventCount, 0);
  assert.equal(metrics.milestones.onboardingWorkspaceCreated.reached, false);
  assert.equal(metrics.milestones.settlementCompleted.firstAt, null);
});
