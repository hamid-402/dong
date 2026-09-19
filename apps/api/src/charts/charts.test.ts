import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { irrMoney } from "@dang/contracts";
import { MemoryAnalyticsStore } from "../analytics/analytics.store.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryPersonalGoalsStore } from "../personal-finance/memory-personal-goals.store.js";
import { MemoryPersonalResourcesStore } from "../personal-finance/memory-personal-resources.store.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { IamStore } from "../iam/iam.types.js";
import type { ReportsStore } from "../reports/reports.store.js";
import type { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";
import { ChartsService } from "./charts.service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const alice = "22222222-2222-4222-8222-222222222222";
const bob = "33333333-3333-4333-8333-333333333333";
const catFood = "44444444-4444-4444-8444-444444444444";
const actor = {
  userId: alice,
  externalSubject: "sub-charts",
  displayName: "Charts Tester",
  authMode: "password" as const,
};

function mockAccess(): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
  } as unknown as WorkspaceAccessService;
}

function mockIam(): IamStore {
  return {
    persistence: "memory",
    getWorkspaceForUser: async () => ({ id: workspaceId, template: "friends_family" }),
    listMembers: async () => [
      { userId: alice, role: "owner", displayName: "آلیس" },
      { userId: bob, role: "member", displayName: "باب" },
    ],
  } as unknown as IamStore;
}

function mockReports(categories: { id: string; name: string; slug: string }[] = []): ReportsStore {
  return {
    persistence: "memory",
    listCategories: async () => categories,
  } as unknown as ReportsStore;
}

function mockPlans(): WaveFSettingsService {
  return {
    requirePlanFeature: async () => ({
      workspaceId,
      plan: "pro" as const,
      seatsLimit: null,
      features: [],
    }),
  } as unknown as WaveFSettingsService;
}

function buildService(
  expenses: MemoryExpenseStore = new MemoryExpenseStore(),
  reports: ReportsStore = mockReports(),
  resources: MemoryPersonalResourcesStore = new MemoryPersonalResourcesStore(),
  goals: MemoryPersonalGoalsStore = new MemoryPersonalGoalsStore(),
  analytics: MemoryAnalyticsStore = new MemoryAnalyticsStore(),
  plans: WaveFSettingsService = mockPlans(),
) {
  return new ChartsService(
    expenses,
    analytics,
    mockIam(),
    mockAccess(),
    resources,
    goals,
    reports,
    plans,
  );
}

test("S11-11 ChartsService empty workspace returns emptyReason", async () => {
  const service = buildService();
  const trend = await service.expenseTrend(actor, workspaceId, 6);
  assert.equal(trend.points.length, 0);
  assert.ok(trend.emptyReason);

  const share = await service.memberShare(actor, workspaceId, "2026-09-01", "2026-09-30");
  assert.equal(share.points.length, 0);
  assert.ok(share.emptyReason);

  const goals = await service.goalProgress(actor);
  assert.equal(goals.points.length, 0);
  assert.ok(goals.emptyReason);
});

test("S11-11 ChartsService aggregates match posted expense fixtures", async () => {
  const expenses = new MemoryExpenseStore();
  const draft = await expenses.createDraft(alice, {
    workspaceId,
    title: "نان",
    total: irrMoney(300_000n),
    paidByUserId: alice,
    splitMethod: "amount",
    participantUserIds: [alice, bob],
    splitLines: [
      { userId: alice, amount: irrMoney(100_000n) },
      { userId: bob, amount: irrMoney(200_000n) },
    ],
    occurredOn: "2026-09-10",
    idempotencyKey: "charts-e1",
    categoryId: catFood,
  });
  await expenses.post(workspaceId, draft.id, alice);

  const service = buildService(
    expenses,
    mockReports([{ id: catFood, name: "خوراک", slug: "food" }]),
  );

  const trend = await service.expenseTrend(actor, workspaceId, 3);
  const sep = trend.points.find((p) => p.key === "2026-09");
  assert.equal(sep?.valueMinor, "300000");

  const share = await service.memberShare(actor, workspaceId, "2026-09-01", "2026-09-30");
  assert.equal(share.points.find((p) => p.key === alice)?.valueMinor, "100000");
  assert.equal(share.points.find((p) => p.key === alice)?.label, "آلیس");
  assert.equal(share.points.find((p) => p.key === bob)?.valueMinor, "200000");
  assert.equal(share.points.find((p) => p.key === bob)?.label, "باب");

  const mix = await service.categoryMix(actor, workspaceId, "2026-09-01", "2026-09-30");
  assert.equal(mix.points.find((p) => p.key === catFood)?.label, "خوراک");
  assert.equal(mix.points.find((p) => p.key === catFood)?.valueMinor, "300000");

  const balance = await service.balanceOverTime(
    actor,
    workspaceId,
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(balance.points[0]?.valueMinor, "200000");
});

test("S11-11 ChartsService personal income/goal from real stores", async () => {
  const resources = new MemoryPersonalResourcesStore();
  const goals = new MemoryPersonalGoalsStore();
  const account = await resources.createAccount(alice, {
    name: "نقد",
    kind: "cash",
    openingBalance: irrMoney(0n),
    idempotencyKey: "acc1",
  });
  await resources.createTxn(alice, {
    accountId: account.id,
    kind: "income",
    amount: irrMoney(1_000_000n),
    occurredOn: "2026-09-01",
    idempotencyKey: "t-in",
  });
  await resources.createTxn(alice, {
    accountId: account.id,
    kind: "expense",
    amount: irrMoney(400_000n),
    occurredOn: "2026-09-05",
    idempotencyKey: "t-out",
  });
  const goal = await goals.createSavingsGoal(alice, {
    name: "سفر",
    targetMinor: "2000000",
    idempotencyKey: "g1",
  });
  await goals.addContribution(alice, goal.id, {
    amountMinor: "500000",
    occurredAt: "2026-09-06T10:00:00.000Z",
    idempotencyKey: "c1",
  });

  const service = buildService(new MemoryExpenseStore(), mockReports(), resources, goals);

  const income = await service.incomeVsExpense(actor, 1);
  const burn = await service.budgetBurn(actor, "2026-09");
  assert.equal(burn.points.length, 1);
  assert.equal(burn.points[0]?.valueMinor, "400000");

  const progress = await service.goalProgress(actor);
  assert.equal(progress.points[0]?.valueMinor, "500000");
  assert.equal(progress.points[0]?.secondaryMinor, "2000000");

  void income;
});

test("G07 kindAggregate skips workspaces without analytics plan", async () => {
  const expenses = new MemoryExpenseStore();
  const wsPro = "11111111-1111-4111-8111-111111111111";
  const wsFree = "22222222-2222-4222-8222-222222222222";
  const draft = await expenses.createDraft(alice, {
    workspaceId: wsPro,
    title: "قهوه",
    total: irrMoney(100_000n),
    paidByUserId: alice,
    splitMethod: "equal",
    participantUserIds: [alice],
    occurredOn: "2026-09-12",
    idempotencyKey: "kind-pro",
  });
  await expenses.post(wsPro, draft.id, alice);

  const iam = {
    persistence: "memory",
    listWorkspacesForUser: async () => [
      {
        id: wsPro,
        slug: "pro-space",
        name: "Pro",
        template: "friends_family" as const,
      },
      {
        id: wsFree,
        slug: "free-space",
        name: "Free",
        template: "friends_family" as const,
      },
    ],
    listMembers: async () => [{ userId: alice, role: "owner", displayName: "آلیس" }],
  } as unknown as IamStore;

  const plans = {
    requirePlanFeature: async (_actor: unknown, workspaceId: string) => {
      if (workspaceId === wsFree) {
        throw new ForbiddenException({ status: 403, code: "plan_required" });
      }
      return { workspaceId, plan: "pro" as const, seatsLimit: null, features: [] };
    },
  } as unknown as WaveFSettingsService;

  const service = new ChartsService(
    expenses,
    new MemoryAnalyticsStore(),
    iam,
    mockAccess(),
    new MemoryPersonalResourcesStore(),
    new MemoryPersonalGoalsStore(),
    mockReports(),
    plans,
  );

  const agg = await service.kindAggregate(actor, "group", 3);
  assert.equal(agg.spaces.length, 1);
  assert.equal(agg.spaces[0]?.workspaceId, wsPro);
  assert.equal(agg.expenseTrend.points.find((p) => p.key === "2026-09")?.valueMinor, "100000");
});

test("G14 memberShare rejects partial date range with CHART_RANGE", async () => {
  const service = buildService();
  await assert.rejects(
    () => service.memberShare(actor, workspaceId, "2026-09-01", undefined),
    (err: unknown) =>
      err instanceof BadRequestException &&
      (err.getResponse() as { code?: string }).code === "CHART_RANGE",
  );
  await assert.rejects(
    () => service.categoryMix(actor, workspaceId, undefined, "2026-09-30"),
    (err: unknown) =>
      err instanceof BadRequestException &&
      (err.getResponse() as { code?: string }).code === "CHART_RANGE",
  );
});

test("G14 expenseTrend prefers analytics_daily_facts over expenses", async () => {
  const expenses = new MemoryExpenseStore();
  const draft = await expenses.createDraft(alice, {
    workspaceId,
    title: "ignored-when-facts",
    total: irrMoney(999_000n),
    paidByUserId: alice,
    splitMethod: "equal",
    participantUserIds: [alice],
    occurredOn: "2026-09-10",
    idempotencyKey: "charts-facts-exp",
  });
  await expenses.post(workspaceId, draft.id, alice);

  const analytics = new MemoryAnalyticsStore();
  await analytics.replaceFacts(workspaceId, alice, [
    {
      workspaceId,
      day: "2026-09-15",
      expenseCount: 2,
      totalMinor: "150000",
      currency: "IRR",
      refreshedAt: "2026-09-16T00:00:00.000Z",
    },
  ]);

  const service = buildService(
    expenses,
    mockReports(),
    new MemoryPersonalResourcesStore(),
    new MemoryPersonalGoalsStore(),
    analytics,
  );
  const trend = await service.expenseTrend(actor, workspaceId, 3);
  assert.equal(trend.source, "analytics_daily_facts");
  assert.equal(trend.points.find((p) => p.key === "2026-09")?.valueMinor, "150000");
});

test("G14 workspace expenseTrend Forbidden when plan lacks analytics", async () => {
  const plans = {
    requirePlanFeature: async () => {
      throw new ForbiddenException({
        status: 403,
        code: "plan_required",
        detail: "قابلیت «analytics» در پلن free فعال نیست",
      });
    },
  } as unknown as WaveFSettingsService;
  const service = buildService(
    new MemoryExpenseStore(),
    mockReports(),
    new MemoryPersonalResourcesStore(),
    new MemoryPersonalGoalsStore(),
    new MemoryAnalyticsStore(),
    plans,
  );
  await assert.rejects(
    () => service.expenseTrend(actor, workspaceId, 3),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("G14 incomeVsExpense uses monthly_close when present", async () => {
  const goals = new MemoryPersonalGoalsStore();
  await goals.upsertMonthlyClose(alice, {
    yearMonth: "2026-09",
    incomeMinor: 2_000_000n,
    expenseMinor: 800_000n,
    groupShareMinor: 0n,
    personalMinor: 800_000n,
    savedMinor: 200_000n,
    empty: false,
  });
  const service = buildService(
    new MemoryExpenseStore(),
    mockReports(),
    new MemoryPersonalResourcesStore(),
    goals,
  );
  const series = await service.incomeVsExpense(actor, 1);
  assert.equal(series.source, "monthly_close");
  assert.ok(series.points.some((p) => p.key === "2026-09"));
});
