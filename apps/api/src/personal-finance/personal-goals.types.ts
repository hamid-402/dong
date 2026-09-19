import type {
  CreateIncomeSourceRequest,
  CreateSavingsGoalContributionRequest,
  CreateSavingsGoalRequest,
  IncomeSourceSummary,
  MonthlyCloseSummary,
  PutSpendingAlertsRequest,
  SavingsGoalContributionSummary,
  SavingsGoalSummary,
  SpendingAlertSummary,
  UpdateIncomeSourceRequest,
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
};

export const PERSONAL_GOALS_STORE = Symbol("PERSONAL_GOALS_STORE");
