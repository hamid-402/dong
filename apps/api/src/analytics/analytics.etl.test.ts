import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDailySpendFacts,
  resolveAnalyticsWarehouseMode,
} from "@dang/contracts";
import { AnalyticsService } from "./analytics.service.js";
import { MemoryAnalyticsStore } from "./analytics.store.js";

test("buildDailySpendFacts aggregates posted non-private IRR only", () => {
  const facts = buildDailySpendFacts("w1", [
    {
      occurredOn: "2026-09-01",
      status: "posted",
      visibility: "shared",
      total: { amountMinor: "1000", currency: "IRR" },
    },
    {
      occurredOn: "2026-09-01",
      status: "posted",
      visibility: "shared",
      total: { amountMinor: "500", currency: "IRR" },
    },
    {
      occurredOn: "2026-09-01",
      status: "draft",
      total: { amountMinor: "9999", currency: "IRR" },
    },
    {
      occurredOn: "2026-09-02",
      status: "posted",
      visibility: "private",
      total: { amountMinor: "800", currency: "IRR" },
    },
  ]);
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.day, "2026-09-01");
  assert.equal(facts[0]?.expenseCount, 2);
  assert.equal(facts[0]?.totalMinor, "1500");
});

test("resolveAnalyticsWarehouseMode distinguishes replica URL", () => {
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "memory" }),
    "memory_etl",
  );
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "postgres" }),
    "postgres_etl",
  );
  assert.equal(
    resolveAnalyticsWarehouseMode({
      persistence: "postgres",
      analyticsDatabaseUrl: "postgresql://analytics",
    }),
    "postgres_replica_etl",
  );
});

test("AnalyticsService ETL writes facts then snapshot reads warehouse only", async () => {
  const store = new MemoryAnalyticsStore();
  const expenses = {
    listForWorkspace: async () => [
      {
        id: "e1",
        occurredOn: "2026-09-10",
        status: "posted",
        visibility: "shared",
        total: { amountMinor: "4200", currency: "IRR" },
      },
    ],
  };
  const iam = {
    listMembers: async () => [
      { userId: "alice", role: "owner" as const },
    ],
  };
  const service = new AnalyticsService(
    store,
    expenses as never,
    iam as never,
    {
      requirePlanFeature: async () => ({
        workspaceId: "w1",
        plan: "pro" as const,
        seatsLimit: null,
        features: [],
      }),
    } as never,
  );
  const actor = {
    userId: "alice",
    displayName: "Alice",
    authMode: "password" as const,
    externalSubject: "alice",
  };

  const run = await service.runEtl(actor, "w1");
  assert.equal(run.status, "success");
  assert.equal(run.rowsUpserted, 1);
  const snap = await service.snapshot(actor, "w1");
  assert.equal(snap.mode, "memory_etl");
  assert.equal(snap.facts[0]?.totalMinor, "4200");
  assert.equal(snap.lastRun?.id, run.id);
  assert.match(snap.note, /حافظه/);
});
