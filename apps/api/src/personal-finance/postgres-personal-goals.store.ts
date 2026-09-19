import {
  and,
  createDatabase,
  eq,
  incomeSource,
  monthlyClose,
  savingsGoal,
  savingsGoalContribution,
  spendingAlert,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import {
  enrichSavingsGoalSummary,
  irrMoney,
  type CreateIncomeSourceRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type IncomeSourceSummary,
  type MonthlyCloseSummary,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalSummary,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdateSavingsGoalRequest,
} from "@dang/contracts";
import type { PersonalGoalsStore } from "./personal-goals.types.js";

function assertMoneyPositive(amountMinor: string): bigint {
  if (!/^\d+$/.test(amountMinor)) throw new Error("MONEY_AMOUNT");
  const value = BigInt(amountMinor);
  if (value <= 0n) throw new Error("MONEY_AMOUNT");
  return value;
}

function assertYearMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("YEAR_MONTH");
}

function toIncome(row: typeof incomeSource.$inferSelect): IncomeSourceSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    expected: row.expectedMinor != null ? irrMoney(row.expectedMinor) : undefined,
    cadence: row.cadence,
    currency: "IRR",
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAlert(row: typeof spendingAlert.$inferSelect): SpendingAlertSummary {
  return {
    id: row.id,
    scope: row.scope,
    refId: row.refId ?? undefined,
    period: row.period,
    limit: irrMoney(row.limitMinor),
    thresholdPercent: row.thresholdPercent,
    channel: row.channel,
    active: row.active,
    lastFiredAt: row.lastFiredAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toClose(
  row: typeof monthlyClose.$inferSelect,
  empty: boolean,
  emptyReason?: string,
): MonthlyCloseSummary {
  return {
    yearMonth: row.yearMonth,
    income: irrMoney(row.incomeMinor),
    expense: irrMoney(row.expenseMinor),
    groupShare: irrMoney(row.groupShareMinor),
    personal: irrMoney(row.personalMinor),
    saved: irrMoney(row.savedMinor),
    topCategoryId: row.topCategoryId ?? undefined,
    computedAt: row.computedAt.toISOString(),
    empty,
    emptyReason,
  };
}

export class PostgresPersonalGoalsStore implements PersonalGoalsStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPersonalGoalsStore {
    const { db } = createDatabase(connectionString);
    return new PostgresPersonalGoalsStore(db);
  }

  private async summarizeGoal(
    tx: AppDatabase,
    goal: typeof savingsGoal.$inferSelect,
  ): Promise<SavingsGoalSummary> {
    const contribs = await tx
      .select()
      .from(savingsGoalContribution)
      .where(eq(savingsGoalContribution.goalId, goal.id));
    const summary = enrichSavingsGoalSummary({
      id: goal.id,
      name: goal.name,
      targetMinor: goal.targetMinor,
      contributionAmountMinors: contribs.map((c) => c.amountMinor),
      targetDate: goal.targetDate,
      accountId: goal.accountId,
      status: goal.status,
      createdAt: goal.createdAt.toISOString(),
      reachedAt: goal.reachedAt?.toISOString() ?? null,
    });
    if (summary.status === "reached" && !goal.reachedAt && goal.status !== "archived") {
      const now = new Date();
      await tx
        .update(savingsGoal)
        .set({ status: "reached", reachedAt: now, updatedAt: now })
        .where(eq(savingsGoal.id, goal.id));
      summary.reachedAt = now.toISOString();
    }
    return summary;
  }

  listIncomeSources(userId: string): Promise<IncomeSourceSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(incomeSource)
        .where(eq(incomeSource.userId, userId));
      return rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(toIncome);
    });
  }

  createIncomeSource(
    userId: string,
    input: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const key = input.idempotencyKey?.trim();
      if (!key) throw new Error("IDEMPOTENCY");
      const name = input.name.trim();
      if (!name) throw new Error("INCOME_NAME");
      const existing = await tx
        .select()
        .from(incomeSource)
        .where(
          and(eq(incomeSource.userId, userId), eq(incomeSource.idempotencyKey, key)),
        );
      if (existing[0]) return toIncome(existing[0]);
      const [row] = await tx
        .insert(incomeSource)
        .values({
          userId,
          name,
          kind: input.kind,
          expectedMinor: input.expected ? BigInt(input.expected.amountMinor) : null,
          cadence: input.cadence ?? "monthly",
          active: input.active ?? true,
          idempotencyKey: key,
        })
        .returning();
      if (!row) throw new Error("INCOME_NOT_FOUND");
      return toIncome(row);
    });
  }

  updateIncomeSource(
    userId: string,
    sourceId: string,
    input: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const existing = await tx
        .select()
        .from(incomeSource)
        .where(and(eq(incomeSource.id, sourceId), eq(incomeSource.userId, userId)));
      if (!existing[0]) throw new Error("INCOME_NOT_FOUND");
      const patch: Partial<typeof incomeSource.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new Error("INCOME_NAME");
        patch.name = name;
      }
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.cadence !== undefined) patch.cadence = input.cadence;
      if (input.active !== undefined) patch.active = input.active;
      if (input.expected === null) patch.expectedMinor = null;
      else if (input.expected !== undefined) {
        patch.expectedMinor = BigInt(input.expected.amountMinor);
      }
      const [row] = await tx
        .update(incomeSource)
        .set(patch)
        .where(eq(incomeSource.id, sourceId))
        .returning();
      if (!row) throw new Error("INCOME_NOT_FOUND");
      return toIncome(row);
    });
  }

  listSavingsGoals(userId: string): Promise<SavingsGoalSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(savingsGoal)
        .where(eq(savingsGoal.userId, userId));
      const out: SavingsGoalSummary[] = [];
      for (const row of rows.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )) {
        out.push(await this.summarizeGoal(tx, row));
      }
      return out;
    });
  }

  createSavingsGoal(
    userId: string,
    input: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const key = input.idempotencyKey?.trim();
      if (!key) throw new Error("IDEMPOTENCY");
      const name = input.name.trim();
      if (!name) throw new Error("GOAL_NAME");
      const targetMinor = assertMoneyPositive(input.targetMinor);
      if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
        throw new Error("DATE");
      }
      const existing = await tx
        .select()
        .from(savingsGoal)
        .where(
          and(eq(savingsGoal.userId, userId), eq(savingsGoal.idempotencyKey, key)),
        );
      if (existing[0]) return this.summarizeGoal(tx, existing[0]);
      const [row] = await tx
        .insert(savingsGoal)
        .values({
          userId,
          name,
          targetMinor,
          targetDate: input.targetDate ?? null,
          accountId: input.accountId ?? null,
          status: "active",
          idempotencyKey: key,
        })
        .returning();
      if (!row) throw new Error("GOAL_NOT_FOUND");
      return this.summarizeGoal(tx, row);
    });
  }

  updateSavingsGoal(
    userId: string,
    goalId: string,
    input: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const existing = await tx
        .select()
        .from(savingsGoal)
        .where(and(eq(savingsGoal.id, goalId), eq(savingsGoal.userId, userId)));
      if (!existing[0]) throw new Error("GOAL_NOT_FOUND");
      const patch: Partial<typeof savingsGoal.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new Error("GOAL_NAME");
        patch.name = name;
      }
      if (input.targetMinor !== undefined) {
        patch.targetMinor = assertMoneyPositive(input.targetMinor);
      }
      if (input.targetDate === null) patch.targetDate = null;
      else if (input.targetDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error("DATE");
        patch.targetDate = input.targetDate;
      }
      if (input.accountId === null) patch.accountId = null;
      else if (input.accountId !== undefined) patch.accountId = input.accountId;
      if (input.status !== undefined) {
        patch.status = input.status;
        if (input.status === "reached") {
          patch.reachedAt = existing[0].reachedAt ?? new Date();
        }
        if (input.status === "active") patch.reachedAt = null;
      }
      const [row] = await tx
        .update(savingsGoal)
        .set(patch)
        .where(eq(savingsGoal.id, goalId))
        .returning();
      if (!row) throw new Error("GOAL_NOT_FOUND");
      return this.summarizeGoal(tx, row);
    });
  }

  addContribution(
    userId: string,
    goalId: string,
    input: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const goals = await tx
        .select()
        .from(savingsGoal)
        .where(and(eq(savingsGoal.id, goalId), eq(savingsGoal.userId, userId)));
      const goal = goals[0];
      if (!goal) throw new Error("GOAL_NOT_FOUND");
      if (goal.status === "archived") throw new Error("GOAL_ARCHIVED");
      const key = input.idempotencyKey?.trim();
      if (!key) throw new Error("IDEMPOTENCY");
      const amountMinor = assertMoneyPositive(input.amountMinor);
      const existing = await tx
        .select()
        .from(savingsGoalContribution)
        .where(
          and(
            eq(savingsGoalContribution.goalId, goalId),
            eq(savingsGoalContribution.idempotencyKey, key),
          ),
        );
      if (existing[0]) {
        return {
          goal: await this.summarizeGoal(tx, goal),
          contribution: {
            id: existing[0].id,
            goalId,
            amount: irrMoney(existing[0].amountMinor),
            occurredAt: existing[0].occurredAt.toISOString(),
            txnId: existing[0].txnId ?? undefined,
            note: existing[0].note ?? undefined,
            createdAt: existing[0].createdAt.toISOString(),
          },
        };
      }
      const occurredAt = new Date(input.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) throw new Error("DATE");
      const [row] = await tx
        .insert(savingsGoalContribution)
        .values({
          goalId,
          amountMinor,
          occurredAt,
          txnId: input.txnId ?? null,
          note: input.note ?? null,
          idempotencyKey: key,
        })
        .returning();
      if (!row) throw new Error("GOAL_NOT_FOUND");
      return {
        goal: await this.summarizeGoal(tx, goal),
        contribution: {
          id: row.id,
          goalId,
          amount: irrMoney(row.amountMinor),
          occurredAt: row.occurredAt.toISOString(),
          txnId: row.txnId ?? undefined,
          note: row.note ?? undefined,
          createdAt: row.createdAt.toISOString(),
        },
      };
    });
  }

  listAlerts(userId: string): Promise<SpendingAlertSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(spendingAlert)
        .where(eq(spendingAlert.userId, userId));
      return rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(toAlert);
    });
  }

  putAlerts(
    userId: string,
    input: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const previous = await tx
        .select()
        .from(spendingAlert)
        .where(eq(spendingAlert.userId, userId));
      const previousById = new Map(previous.map((row) => [row.id, row]));
      await tx.delete(spendingAlert).where(eq(spendingAlert.userId, userId));
      const out: SpendingAlertSummary[] = [];
      for (const alert of input.alerts) {
        const limitMinor = assertMoneyPositive(alert.limitMinor);
        const threshold = alert.thresholdPercent ?? 80;
        if (threshold < 1 || threshold > 100) throw new Error("ALERT_PERCENT");
        const id = alert.id?.trim() || undefined;
        const prev = id ? previousById.get(id) : undefined;
        const [row] = await tx
          .insert(spendingAlert)
          .values({
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
            createdAt: prev?.createdAt,
          })
          .returning();
        if (!row) throw new Error("ALERT_PERCENT");
        out.push(toAlert(row));
      }
      return out;
    });
  }

  markAlertFired(
    userId: string,
    alertId: string,
    firedAt?: string,
  ): Promise<SpendingAlertSummary | null> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const existing = await tx
        .select()
        .from(spendingAlert)
        .where(and(eq(spendingAlert.id, alertId), eq(spendingAlert.userId, userId)));
      if (!existing[0]) return null;
      const [row] = await tx
        .update(spendingAlert)
        .set({
          lastFiredAt: firedAt ? new Date(firedAt) : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(spendingAlert.id, alertId))
        .returning();
      return row ? toAlert(row) : null;
    });
  }

  getMonthlyClose(
    userId: string,
    yearMonth: string,
  ): Promise<MonthlyCloseSummary | null> {
    assertYearMonth(yearMonth);
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(monthlyClose)
        .where(
          and(eq(monthlyClose.userId, userId), eq(monthlyClose.yearMonth, yearMonth)),
        );
      if (!rows[0]) return null;
      const empty =
        rows[0].incomeMinor === 0n &&
        rows[0].personalMinor === 0n &&
        rows[0].groupShareMinor === 0n;
      return toClose(
        rows[0],
        empty,
        empty ? "برای این ماه تراکنش یا سهم گروهی ثبت نشده است" : undefined,
      );
    });
  }

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
  ): Promise<MonthlyCloseSummary> {
    assertYearMonth(row.yearMonth);
    return withTenantContext(this.db, { userId }, async (tx) => {
      const existing = await tx
        .select()
        .from(monthlyClose)
        .where(
          and(
            eq(monthlyClose.userId, userId),
            eq(monthlyClose.yearMonth, row.yearMonth),
          ),
        );
      const values = {
        userId,
        yearMonth: row.yearMonth,
        incomeMinor: row.incomeMinor,
        expenseMinor: row.expenseMinor,
        groupShareMinor: row.groupShareMinor,
        personalMinor: row.personalMinor,
        savedMinor: row.savedMinor,
        topCategoryId: row.topCategoryId ?? null,
        computedAt: new Date(),
      };
      const [stored] = existing[0]
        ? await tx
            .update(monthlyClose)
            .set(values)
            .where(
              and(
                eq(monthlyClose.userId, userId),
                eq(monthlyClose.yearMonth, row.yearMonth),
              ),
            )
            .returning()
        : await tx.insert(monthlyClose).values(values).returning();
      if (!stored) throw new Error("YEAR_MONTH");
      return toClose(stored, row.empty, row.emptyReason);
    });
  }
}
