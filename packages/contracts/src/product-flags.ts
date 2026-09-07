/** Product feature flags (Dong 2.0) — env-backed, reported via capabilities. */

export type ProductFeatureFlags = {
  /** Personal add-on ack FSM (`pending_ack` …). Off until Wave 2 UI/API ready. */
  addonAck: boolean;
  /** Background `recurrence-tick` worker. Off until Wave 4. */
  recurrenceWorker: boolean;
  /** First-class debt-simplify API/UI (Wave 3). */
  debtSimplifyApi: boolean;
  /** Real period comparison report (Wave 6 BI). */
  biCompare: boolean;
  /** Workspace cost-center CRUD (Wave 6 F4). */
  costCenter: boolean;
  /** Per-member weekly/monthly limits (Wave F2). */
  allowance: boolean;
  /** Server-enforced workspace expense approval policy (Wave F6). */
  expensePolicy: boolean;
  /** Real multi-source approval queue (Wave U4). */
  approvalQueue: boolean;
  reimbursement: boolean;
  categoryBudget: boolean;
  fxRates: boolean;
  expenseImport: boolean;
  weeklyDigest: boolean;
  workspacePlans: boolean;
  planAdmin: boolean;
  approvalSteps: boolean;
};

export const PRODUCT_FLAG_ENV = {
  addonAck: "ENABLE_ADDON_ACK",
  recurrenceWorker: "ENABLE_RECURRENCE_WORKER",
  debtSimplifyApi: "ENABLE_DEBT_SIMPLIFY_API",
  biCompare: "ENABLE_BI_COMPARE",
  costCenter: "ENABLE_COST_CENTER",
  allowance: "ENABLE_ALLOWANCE",
  expensePolicy: "ENABLE_EXPENSE_POLICY",
  approvalQueue: "ENABLE_APPROVAL_QUEUE",
  reimbursement: "ENABLE_REIMBURSEMENT",
  categoryBudget: "ENABLE_CATEGORY_BUDGET",
  fxRates: "ENABLE_FX_RATES",
  expenseImport: "ENABLE_EXPENSE_IMPORT",
  weeklyDigest: "ENABLE_WEEKLY_DIGEST",
  workspacePlans: "ENABLE_WORKSPACE_PLANS",
  planAdmin: "ENABLE_PLAN_ADMIN",
  approvalSteps: "ENABLE_APPROVAL_STEPS",
} as const;

function parseTriState(
  value: string | undefined,
  defaultWhenUnset: boolean,
): boolean {
  if (value === undefined || value === "") return defaultWhenUnset;
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * Read product flags from an env bag.
 *
 * - production: unset → false (safe merge; opt-in per flag)
 * - development/test: unset → true (full local product surface)
 * - Explicit `0`/`false` always forces off; `1`/`true` always forces on
 * - `DANG_PRODUCT_FLAGS_DEFAULT=0|1` overrides the unset default for all flags
 */
export function readProductFeatureFlags(
  env: Record<string, string | undefined> = {},
): ProductFeatureFlags {
  const nodeEnv = env.NODE_ENV ?? "development";
  const unsetDefault = parseTriState(
    env.DANG_PRODUCT_FLAGS_DEFAULT,
    nodeEnv !== "production",
  );
  return {
    addonAck: parseTriState(env[PRODUCT_FLAG_ENV.addonAck], unsetDefault),
    recurrenceWorker: parseTriState(
      env[PRODUCT_FLAG_ENV.recurrenceWorker],
      unsetDefault,
    ),
    debtSimplifyApi: parseTriState(
      env[PRODUCT_FLAG_ENV.debtSimplifyApi],
      unsetDefault,
    ),
    biCompare: parseTriState(env[PRODUCT_FLAG_ENV.biCompare], unsetDefault),
    costCenter: parseTriState(env[PRODUCT_FLAG_ENV.costCenter], unsetDefault),
    allowance: parseTriState(env[PRODUCT_FLAG_ENV.allowance], unsetDefault),
    expensePolicy: parseTriState(
      env[PRODUCT_FLAG_ENV.expensePolicy],
      unsetDefault,
    ),
    approvalQueue: parseTriState(
      env[PRODUCT_FLAG_ENV.approvalQueue],
      unsetDefault,
    ),
    reimbursement: parseTriState(
      env[PRODUCT_FLAG_ENV.reimbursement],
      unsetDefault,
    ),
    categoryBudget: parseTriState(
      env[PRODUCT_FLAG_ENV.categoryBudget],
      unsetDefault,
    ),
    fxRates: parseTriState(env[PRODUCT_FLAG_ENV.fxRates], unsetDefault),
    expenseImport: parseTriState(
      env[PRODUCT_FLAG_ENV.expenseImport],
      unsetDefault,
    ),
    weeklyDigest: parseTriState(
      env[PRODUCT_FLAG_ENV.weeklyDigest],
      unsetDefault,
    ),
    workspacePlans: parseTriState(
      env[PRODUCT_FLAG_ENV.workspacePlans],
      unsetDefault,
    ),
    planAdmin: parseTriState(env[PRODUCT_FLAG_ENV.planAdmin], unsetDefault),
    approvalSteps: parseTriState(
      env[PRODUCT_FLAG_ENV.approvalSteps],
      unsetDefault,
    ),
  };
}
