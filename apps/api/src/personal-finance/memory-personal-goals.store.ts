import {
  assertAllocationPercents,
  assertMoneyIntentPayload,
  enrichSavingsGoalSummary,
  irrMoney,
  type AllocationPlanSummary,
  type CreateIncomeSourceRequest,
  type CreateMoneyIntentRequest,
  type CreatePaycheckRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type IncomeCadence,
  type IncomeSourceKind,
  type IncomeSourceSummary,
  type LifeDomain,
  type MoneyIntentKind,
  type MoneyIntentPeriod,
  type MoneyIntentSummary,
  type MonthlyCloseSummary,
  type PaycheckSummary,
  type PutAllocationPlanRequest,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalStatus,
  type SavingsGoalSummary,
  type SpendingAlertChannel,
  type SpendingAlertPeriod,
  type SpendingAlertScope,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdateMoneyIntentRequest,
  type UpdateSavingsGoalRequest,
} from "@dang/contracts";
import type { PersonalGoalsStore } from "./personal-goals.types.js";

type MemIncome = {
  id: string;
  userId: string;
  name: string;
  kind: IncomeSourceKind;
  expectedMinor: bigint | null;
  cadence: IncomeCadence;
  active: boolean;
  idempotencyKey: string;
  createdAt: string;
};

type MemGoal = {
  id: string;
  userId: string;
  name: string;
  targetMinor: bigint;
  targetDate: string | null;
  accountId: string | null;
  status: SavingsGoalStatus;
  idempotencyKey: string;
  createdAt: string;
  reachedAt: string | null;
};

type MemIntent = {
  id: string;
  userId: string;
  name: string;
  kind: MoneyIntentKind;
  period: MoneyIntentPeriod;
  targetMinor: string | null;
  targetPercent: number | null;
  goalId: string | null;
  active: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

type MemContribution = {
  id: string;
  goalId: string;
  amountMinor: bigint;
  occurredAt: string;
  txnId?: string;
  note?: string;
  idempotencyKey: string;
  createdAt: string;
};

type MemAlert = {
  id: string;
  userId: string;
  scope: SpendingAlertScope;
  refId: string | null;
  period: SpendingAlertPeriod;
  limitMinor: bigint;
  thresholdPercent: number;
  channel: SpendingAlertChannel;
  active: boolean;
  lastFiredAt: string | null;
  createdAt: string;
};

type MemClose = {
  userId: string;
  yearMonth: string;
  incomeMinor: bigint;
  expenseMinor: bigint;
  groupShareMinor: bigint;
  personalMinor: bigint;
  savedMinor: bigint;
  topCategoryId: string | null;
  computedAt: string;
  empty: boolean;
  emptyReason?: string;
};

type MemAllocation = {
  userId: string;
  percents: Record<LifeDomain, number>;
  updatedAt: string;
};

type MemPaycheck = {
  id: string;
  userId: string;
  yearMonth: string;
  amountMinor: bigint;
  occurredOn: string;
  incomeSourceId?: string;
  moneyTxnId?: string;
  note?: string;
  idempotencyKey: string;
  createdAt: string;
};

function assertMoneyPositive(amountMinor: string): bigint {
  if (!/^\d+$/.test(amountMinor)) throw new Error("MONEY_AMOUNT");
  const value = BigInt(amountMinor);
  if (value <= 0n) throw new Error("MONEY_AMOUNT");
  return value;
}

function assertYearMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("YEAR_MONTH");
}

function toIncome(row: MemIncome): IncomeSourceSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    expected: row.expectedMinor != null ? irrMoney(row.expectedMinor) : undefined,
    cadence: row.cadence,
    currency: "IRR",
    active: row.active,
    createdAt: row.createdAt,
  };
}

function toAlert(row: MemAlert): SpendingAlertSummary {
  return {
    id: row.id,
    scope: row.scope,
    refId: row.refId ?? undefined,
    period: row.period,
    limit: irrMoney(row.limitMinor),
    thresholdPercent: row.thresholdPercent,
    channel: row.channel,
    active: row.active,
    lastFiredAt: row.lastFiredAt ?? undefined,
    createdAt: row.createdAt,
  };
}

function toClose(row: MemClose): MonthlyCloseSummary {
  return {
    yearMonth: row.yearMonth,
    income: irrMoney(row.incomeMinor),
    expense: irrMoney(row.expenseMinor),
    groupShare: irrMoney(row.groupShareMinor),
    personal: irrMoney(row.personalMinor),
    saved: irrMoney(row.savedMinor),
    topCategoryId: row.topCategoryId ?? undefined,
    computedAt: row.computedAt,
    empty: row.empty,
    emptyReason: row.emptyReason,
  };
}

export class MemoryPersonalGoalsStore implements PersonalGoalsStore {
  readonly persistence = "memory" as const;

  private readonly incomes = new Map<string, MemIncome>();
  private readonly goals = new Map<string, MemGoal>();
  private readonly intents = new Map<string, MemIntent>();
  private readonly contributions = new Map<string, MemContribution>();
  private readonly alerts = new Map<string, MemAlert>();
  private readonly closes = new Map<string, MemClose>();
  private readonly allocations = new Map<string, MemAllocation>();
  private readonly paychecks = new Map<string, MemPaycheck>();

  private goalContributions(goalId: string): MemContribution[] {
    return [...this.contributions.values()].filter((c) => c.goalId === goalId);
  }

  private summarizeGoal(goal: MemGoal): SavingsGoalSummary {
    const amounts = this.goalContributions(goal.id).map((c) => c.amountMinor);
    const summary = enrichSavingsGoalSummary({
      id: goal.id,
      name: goal.name,
      targetMinor: goal.targetMinor,
      contributionAmountMinors: amounts,
      targetDate: goal.targetDate,
      accountId: goal.accountId,
      status: goal.status,
      createdAt: goal.createdAt,
      reachedAt: goal.reachedAt,
    });
    if (summary.status === "reached" && !goal.reachedAt) {
      goal.reachedAt = new Date().toISOString();
      goal.status = "reached";
      summary.reachedAt = goal.reachedAt;
    }
    return summary;
  }

  async listIncomeSources(userId: string): Promise<IncomeSourceSummary[]> {
    return [...this.incomes.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toIncome);
  }

  async createIncomeSource(
    userId: string,
    input: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    const key = input.idempotencyKey?.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const name = input.name.trim();
    if (!name) throw new Error("INCOME_NAME");
    const existing = [...this.incomes.values()].find(
      (r) => r.userId === userId && r.idempotencyKey === key,
    );
    if (existing) return toIncome(existing);
    const row: MemIncome = {
      id: crypto.randomUUID(),
      userId,
      name,
      kind: input.kind,
      expectedMinor: input.expected
        ? BigInt(input.expected.amountMinor)
        : null,
      cadence: input.cadence ?? "monthly",
      active: input.active ?? true,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    this.incomes.set(row.id, row);
    return toIncome(row);
  }

  async updateIncomeSource(
    userId: string,
    sourceId: string,
    input: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    const row = this.incomes.get(sourceId);
    if (!row || row.userId !== userId) throw new Error("INCOME_NOT_FOUND");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("INCOME_NAME");
      row.name = name;
    }
    if (input.kind !== undefined) row.kind = input.kind;
    if (input.cadence !== undefined) row.cadence = input.cadence;
    if (input.active !== undefined) row.active = input.active;
    if (input.expected === null) row.expectedMinor = null;
    else if (input.expected !== undefined) {
      row.expectedMinor = BigInt(input.expected.amountMinor);
    }
    return toIncome(row);
  }

  async listSavingsGoals(userId: string): Promise<SavingsGoalSummary[]> {
    return [...this.goals.values()]
      .filter((g) => g.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((g) => this.summarizeGoal(g));
  }

  async createSavingsGoal(
    userId: string,
    input: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    const key = input.idempotencyKey?.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const name = input.name.trim();
    if (!name) throw new Error("GOAL_NAME");
    const targetMinor = assertMoneyPositive(input.targetMinor);
    const existing = [...this.goals.values()].find(
      (g) => g.userId === userId && g.idempotencyKey === key,
    );
    if (existing) return this.summarizeGoal(existing);
    if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
      throw new Error("DATE");
    }
    const row: MemGoal = {
      id: crypto.randomUUID(),
      userId,
      name,
      targetMinor,
      targetDate: input.targetDate ?? null,
      accountId: input.accountId ?? null,
      status: "active",
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
      reachedAt: null,
    };
    this.goals.set(row.id, row);
    return this.summarizeGoal(row);
  }

  async updateSavingsGoal(
    userId: string,
    goalId: string,
    input: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    const row = this.goals.get(goalId);
    if (!row || row.userId !== userId) throw new Error("GOAL_NOT_FOUND");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("GOAL_NAME");
      row.name = name;
    }
    if (input.targetMinor !== undefined) {
      row.targetMinor = assertMoneyPositive(input.targetMinor);
    }
    if (input.targetDate === null) row.targetDate = null;
    else if (input.targetDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error("DATE");
      row.targetDate = input.targetDate;
    }
    if (input.accountId === null) row.accountId = null;
    else if (input.accountId !== undefined) row.accountId = input.accountId;
    if (input.status !== undefined) {
      row.status = input.status;
      if (input.status === "reached" && !row.reachedAt) {
        row.reachedAt = new Date().toISOString();
      }
      if (input.status === "active") row.reachedAt = null;
    }
    return this.summarizeGoal(row);
  }

  async addContribution(
    userId: string,
    goalId: string,
    input: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    const goal = this.goals.get(goalId);
    if (!goal || goal.userId !== userId) throw new Error("GOAL_NOT_FOUND");
    if (goal.status === "archived") throw new Error("GOAL_ARCHIVED");
    const key = input.idempotencyKey?.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    const amountMinor = assertMoneyPositive(input.amountMinor);
    const existing = [...this.contributions.values()].find(
      (c) => c.goalId === goalId && c.idempotencyKey === key,
    );
    if (existing) {
      return {
        goal: this.summarizeGoal(goal),
        contribution: {
          id: existing.id,
          goalId,
          amount: irrMoney(existing.amountMinor),
          occurredAt: existing.occurredAt,
          txnId: existing.txnId,
          note: existing.note,
          createdAt: existing.createdAt,
        },
      };
    }
    const occurredAt = input.occurredAt.trim();
    if (!occurredAt) throw new Error("DATE");
    const row: MemContribution = {
      id: crypto.randomUUID(),
      goalId,
      amountMinor,
      occurredAt,
      txnId: input.txnId,
      note: input.note,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    this.contributions.set(row.id, row);
    const summary = this.summarizeGoal(goal);
    return {
      goal: summary,
      contribution: {
        id: row.id,
        goalId,
        amount: irrMoney(row.amountMinor),
        occurredAt: row.occurredAt,
        txnId: row.txnId,
        note: row.note,
        createdAt: row.createdAt,
      },
    };
  }

  async listAlerts(userId: string): Promise<SpendingAlertSummary[]> {
    return [...this.alerts.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toAlert);
  }

  async putAlerts(
    userId: string,
    input: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]> {
    const previousById = new Map<string, MemAlert>();
    for (const [id, row] of this.alerts) {
      if (row.userId === userId) {
        previousById.set(id, row);
        this.alerts.delete(id);
      }
    }
    const now = new Date().toISOString();
    const created: MemAlert[] = [];
    for (const alert of input.alerts) {
      const limitMinor = assertMoneyPositive(alert.limitMinor);
      const threshold = alert.thresholdPercent ?? 80;
      if (threshold < 1 || threshold > 100) throw new Error("ALERT_PERCENT");
      const id = alert.id?.trim() || crypto.randomUUID();
      const prev = previousById.get(id);
      const row: MemAlert = {
        id,
        userId,
        scope: alert.scope,
        refId: alert.refId ?? null,
        period: alert.period ?? "month",
        limitMinor,
        thresholdPercent: threshold,
        channel: alert.channel ?? "inapp",
        active: alert.active ?? true,
        lastFiredAt: prev?.lastFiredAt ?? null,
        createdAt: prev?.createdAt ?? now,
      };
      this.alerts.set(row.id, row);
      created.push(row);
    }
    return created.map(toAlert);
  }

  async markAlertFired(
    userId: string,
    alertId: string,
    firedAt?: string,
  ): Promise<SpendingAlertSummary | null> {
    const row = this.alerts.get(alertId);
    if (!row || row.userId !== userId) return null;
    row.lastFiredAt = firedAt ?? new Date().toISOString();
    return toAlert(row);
  }

  async getMonthlyClose(
    userId: string,
    yearMonth: string,
  ): Promise<MonthlyCloseSummary | null> {
    assertYearMonth(yearMonth);
    const row = this.closes.get(`${userId}:${yearMonth}`);
    return row ? toClose(row) : null;
  }

  async upsertMonthlyClose(
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
  ): Promise<MonthlyCloseSummary> {
    assertYearMonth(row.yearMonth);
    const stored: MemClose = {
      userId,
      yearMonth: row.yearMonth,
      incomeMinor: row.incomeMinor,
      expenseMinor: row.expenseMinor,
      groupShareMinor: row.groupShareMinor,
      personalMinor: row.personalMinor,
      savedMinor: row.savedMinor,
      topCategoryId: row.topCategoryId ?? null,
      computedAt: new Date().toISOString(),
      empty: row.empty,
      emptyReason: row.emptyReason,
    };
    this.closes.set(`${userId}:${row.yearMonth}`, stored);
    return toClose(stored);
  }

  private toIntent(row: MemIntent): MoneyIntentSummary {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      period: row.period,
      targetMinor: row.targetMinor ?? undefined,
      targetPercent: row.targetPercent ?? undefined,
      goalId: row.goalId ?? undefined,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listMoneyIntents(userId: string): Promise<MoneyIntentSummary[]> {
    return [...this.intents.values()]
      .filter((i) => i.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => this.toIntent(i));
  }

  async createMoneyIntent(
    userId: string,
    input: CreateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary> {
    const key = input.idempotencyKey?.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    assertMoneyIntentPayload({
      kind: input.kind,
      name: input.name,
      targetMinor: input.targetMinor,
      targetPercent: input.targetPercent,
      goalId: input.goalId,
    });
    const existing = [...this.intents.values()].find(
      (i) => i.userId === userId && i.idempotencyKey === key,
    );
    if (existing) return this.toIntent(existing);
    const now = new Date().toISOString();
    const row: MemIntent = {
      id: crypto.randomUUID(),
      userId,
      name: input.name.trim(),
      kind: input.kind,
      period: input.period ?? "month",
      targetMinor: input.targetMinor ?? null,
      targetPercent: input.targetPercent ?? null,
      goalId: input.goalId ?? null,
      active: input.active !== false,
      idempotencyKey: key,
      createdAt: now,
      updatedAt: now,
    };
    this.intents.set(row.id, row);
    return this.toIntent(row);
  }

  async updateMoneyIntent(
    userId: string,
    intentId: string,
    input: UpdateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary> {
    const row = this.intents.get(intentId);
    if (!row || row.userId !== userId) throw new Error("INTENT_NOT_FOUND");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("INTENT_NAME");
      row.name = name;
    }
    if (input.period !== undefined) row.period = input.period;
    if (input.targetMinor === null) row.targetMinor = null;
    else if (input.targetMinor !== undefined) row.targetMinor = input.targetMinor;
    if (input.targetPercent === null) row.targetPercent = null;
    else if (input.targetPercent !== undefined) row.targetPercent = input.targetPercent;
    if (input.goalId === null) row.goalId = null;
    else if (input.goalId !== undefined) row.goalId = input.goalId;
    if (input.active !== undefined) row.active = input.active;
    assertMoneyIntentPayload({
      kind: row.kind,
      name: row.name,
      targetMinor: row.targetMinor,
      targetPercent: row.targetPercent,
      goalId: row.goalId,
    });
    row.updatedAt = new Date().toISOString();
    return this.toIntent(row);
  }

  async sumContributionsInRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<bigint> {
    const goalIds = new Set(
      [...this.goals.values()].filter((g) => g.userId === userId).map((g) => g.id),
    );
    let total = 0n;
    for (const c of this.contributions.values()) {
      if (!goalIds.has(c.goalId)) continue;
      const day = c.occurredAt.slice(0, 10);
      if (day < from || day > to) continue;
      total += c.amountMinor;
    }
    return total;
  }

  async getAllocationPlan(userId: string): Promise<AllocationPlanSummary | null> {
    const row = this.allocations.get(userId);
    if (!row) return null;
    return {
      userId,
      percents: { ...row.percents },
      updatedAt: row.updatedAt,
    };
  }

  async putAllocationPlan(
    userId: string,
    input: PutAllocationPlanRequest,
  ): Promise<AllocationPlanSummary> {
    assertAllocationPercents(input.percents);
    const updatedAt = new Date().toISOString();
    const row: MemAllocation = {
      userId,
      percents: { ...input.percents },
      updatedAt,
    };
    this.allocations.set(userId, row);
    return { userId, percents: { ...row.percents }, updatedAt };
  }

  async listPaychecks(
    userId: string,
    opts?: { yearMonth?: string },
  ): Promise<PaycheckSummary[]> {
    return [...this.paychecks.values()]
      .filter((p) => {
        if (p.userId !== userId) return false;
        if (opts?.yearMonth && p.yearMonth !== opts.yearMonth) return false;
        return true;
      })
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
      .map(toPaycheck);
  }

  async createPaycheck(
    userId: string,
    input: CreatePaycheckRequest & {
      yearMonth: string;
      moneyTxnId?: string;
    },
  ): Promise<PaycheckSummary> {
    const key = input.idempotencyKey?.trim();
    if (!key) throw new Error("IDEMPOTENCY");
    assertYearMonth(input.yearMonth);
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw new Error("MONEY_AMOUNT");
    const byKey = [...this.paychecks.values()].find(
      (p) => p.userId === userId && p.idempotencyKey === key,
    );
    if (byKey) return toPaycheck(byKey);
    const byMonth = [...this.paychecks.values()].find(
      (p) => p.userId === userId && p.yearMonth === input.yearMonth,
    );
    if (byMonth) throw new Error("PAYCHECK_MONTH_EXISTS");
    const row: MemPaycheck = {
      id: crypto.randomUUID(),
      userId,
      yearMonth: input.yearMonth,
      amountMinor: amount,
      occurredOn: input.occurredOn,
      incomeSourceId: input.incomeSourceId,
      moneyTxnId: input.moneyTxnId,
      note: input.note?.trim() || undefined,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    this.paychecks.set(row.id, row);
    return toPaycheck(row);
  }

}

function toPaycheck(row: MemPaycheck): PaycheckSummary {
  return {
    id: row.id,
    userId: row.userId,
    yearMonth: row.yearMonth,
    amount: irrMoney(row.amountMinor),
    occurredOn: row.occurredOn,
    incomeSourceId: row.incomeSourceId,
    moneyTxnId: row.moneyTxnId,
    note: row.note,
    createdAt: row.createdAt,
  };
}
