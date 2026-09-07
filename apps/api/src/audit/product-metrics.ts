import type {
  ProductMetricCounts,
  ProductMetricMilestone,
  WorkspaceProductMetricsResponse,
} from "@dang/contracts";
import type { AuditRecord } from "./audit.types.js";

const ACTIONS = {
  workspaceCreate: "workspace.create",
  inviteAccept: "invite.accept",
  expensePost: "expense.post",
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

/** Pure aggregation — unit-tested; no invented rates. */
export function aggregateWorkspaceProductMetrics(
  workspaceId: string,
  events: AuditRecord[],
  auditPersistence: "memory" | "postgres",
): WorkspaceProductMetricsResponse {
  const counts: ProductMetricCounts = {
    workspaceCreates: successEvents(events, ACTIONS.workspaceCreate).length,
    inviteAccepts: successEvents(events, ACTIONS.inviteAccept).length,
    expensePosts: successEvents(events, ACTIONS.expensePost).length,
    settlementConfirms: successEvents(events, ACTIONS.settlementConfirm).length,
  };

  return {
    workspaceId,
    auditPersistence,
    eventCount: events.length,
    counts,
    milestones: {
      onboardingWorkspaceCreated: milestone(events, ACTIONS.workspaceCreate),
      inviteAccepted: milestone(events, ACTIONS.inviteAccept),
      firstExpensePosted: milestone(events, ACTIONS.expensePost),
      settlementCompleted: milestone(events, ACTIONS.settlementConfirm),
    },
  };
}
