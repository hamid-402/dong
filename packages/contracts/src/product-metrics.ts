/** Product funnel metrics derived from real audit events (dong-50 #33). */

export type ProductMetricCounts = {
  /** `workspace.create` successes */
  workspaceCreates: number;
  /** `invite.accept` successes */
  inviteAccepts: number;
  /** `expense.post` successes (ledger-applied expenses) */
  expensePosts: number;
  /** `settlement.claim.confirm` successes */
  settlementConfirms: number;
};

export type ProductMetricMilestone = {
  /** True when at least one matching audit event exists. */
  reached: boolean;
  /** ISO timestamp of the earliest matching success event, if any. */
  firstAt: string | null;
  /** Audit action used as the source of truth. */
  sourceAction: string;
};

export type WorkspaceProductMetricsResponse = {
  workspaceId: string;
  /** Audit store persistence from runtime capabilities path. */
  auditPersistence: "memory" | "postgres";
  /** Total audit events readable for this member in the workspace. */
  eventCount: number;
  counts: ProductMetricCounts;
  milestones: {
    onboardingWorkspaceCreated: ProductMetricMilestone;
    inviteAccepted: ProductMetricMilestone;
    firstExpensePosted: ProductMetricMilestone;
    settlementCompleted: ProductMetricMilestone;
  };
};
