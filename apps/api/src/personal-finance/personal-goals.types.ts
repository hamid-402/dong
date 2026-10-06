import type {
  AllocationPlanSummary,
  CreateIncomeSourceRequest,
  CreateMoneyIntentRequest,
  CreatePaycheckRequest,
  CreateSavingsGoalContributionRequest,
  CreateSavingsGoalRequest,
  IncomeSourceSummary,
  MoneyIntentSummary,
  MonthlyCloseSummary,
  PaycheckSummary,
  PutAllocationPlanRequest,
  PutSpendingAlertsRequest,
  SavingsGoalContributionSummary,
  SavingsGoalSummary,
  SpendingAlertSummary,
  UpdateIncomeSourceRequest,
  UpdateMoneyIntentRequest,
  UpdateSavingsGoalRequest,
} from "@dang/contracts";

export type PersonalGoalsStore = {
  readonly persistence: "memory" | "postgres";

  listIncomeSources(userId: string): Promise<IncomeSourceSummary[]>;
  createIncomeSource(
    userId: string,
    input: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary>;
  updateIncomeSource(
    userId: string,
    sourceId: string,
    input: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary>;

  listSavingsGoals(userId: string): Promise<SavingsGoalSummary[]>;
  createSavingsGoal(
    userId: string,
    input: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary>;
  updateSavingsGoal(
    userId: string,
    goalId: string,
    input: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary>;
  addContribution(
    userId: string,
    goalId: string,
    input: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }>;
  /** Sum of goal contributions with occurredAt date in [from, to] inclusive (ISO day). */
  sumContributionsInRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<bigint>;

  listAlerts(userId: string): Promise<SpendingAlertSummary[]>;
  putAlerts(
    userId: string,
    input: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]>;
  markAlertFired(
    userId: string,
    alertId: string,
    firedAt?: string,
  ): Promise<SpendingAlertSummary | null>;

  listMoneyIntents(userId: string): Promise<MoneyIntentSummary[]>;
  createMoneyIntent(
    userId: string,
    input: CreateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary>;
  updateMoneyIntent(
    userId: string,
    intentId: string,
    input: UpdateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary>;

  getMonthlyClose(
    userId: string,
    yearMonth: string,
  ): Promise<MonthlyCloseSummary | null>;
  upsertMonthlyClose(
    userId: string,
    row: {
      yearMonth: string;
      incomeMinor: bigint;
      expenseMinor: bigint;
      groupShareMinor: bigint;
      personalMinor: bigint;
      savedMinor: bigint;
      topCategoryId?: string | null;
      empty: boolean;
      emptyReason?: string;
    },
  ): Promise<MonthlyCloseSummary>;

  getAllocationPlan(userId: string): Promise<AllocationPlanSummary | null>;
  putAllocationPlan(
    userId: string,
    input: PutAllocationPlanRequest,
  ): Promise<AllocationPlanSummary>;

  listPaychecks(
    userId: string,
    opts?: { yearMonth?: string },
  ): Promise<PaycheckSummary[]>;
  createPaycheck(
    userId: string,
    input: CreatePaycheckRequest & {
      yearMonth: string;
      moneyTxnId?: string;
    },
  ): Promise<PaycheckSummary>;
};

export const PERSONAL_GOALS_STORE = Symbol("PERSONAL_GOALS_STORE");
