import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailySpendFacts,
  resolveAnalyticsWarehouseMode,
} from "../src/analytics-warehouse.js";

const row = (
  occurredOn: string,
  amountMinor: string,
  extra: Partial<{ status: string; visibility: string; currency: string }> = {},
) => ({
  occurredOn,
  status: extra.status ?? "posted",
  visibility: extra.visibility,
  total: { amountMinor, currency: extra.currency ?? "IRR" },
});

test("buildDailySpendFacts aggregates posted IRR expenses by day, sorted ascending", () => {
  const facts = buildDailySpendFacts(
    "ws1",
    [
      row("2026-03-02T10:00:00Z", "300"),
      row("2026-03-01", "100"),
      row("2026-03-02", "200"),
    ],
    "2026-03-05T00:00:00.000Z",
  );
  assert.deepEqual(facts, [
    {
      workspaceId: "ws1",
      day: "2026-03-01",
      expenseCount: 1,
      totalMinor: "100",
      currency: "IRR",
      refreshedAt: "2026-03-05T00:00:00.000Z",
    },
    {
      workspaceId: "ws1",
      day: "2026-03-02",
      expenseCount: 2,
      totalMinor: "500",
      currency: "IRR",
      refreshedAt: "2026-03-05T00:00:00.000Z",
    },
  ]);
});

test("buildDailySpendFacts skips drafts, private, foreign currency, bad dates and bad amounts", () => {
  const facts = buildDailySpendFacts(
    "ws1",
    [
      row("2026-03-01", "100", { status: "draft" }),
      row("2026-03-01", "100", { visibility: "private" }),
      row("2026-03-01", "100", { currency: "USD" }),
      row("not-a-date", "100"),
      row("2026-03-01", "abc"),
      row("2026-03-01", "-5"),
      row("2026-03-01", "70", { visibility: "shared" }),
    ],
    "t",
  );
  assert.equal(facts.length, 1);
  assert.equal(facts[0]!.totalMinor, "70");
  assert.equal(facts[0]!.expenseCount, 1);
});

test("buildDailySpendFacts returns empty for no input and defaults refreshedAt to an ISO time", () => {
  assert.deepEqual(buildDailySpendFacts("ws1", []), []);
  const [fact] = buildDailySpendFacts("ws1", [row("2026-01-01", "1")]);
  assert.ok(fact);
  assert.ok(!Number.isNaN(Date.parse(fact.refreshedAt)));
});

test("resolveAnalyticsWarehouseMode maps persistence and replica url", () => {
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "memory", analyticsDatabaseUrl: "postgres://x" }),
    "memory_etl",
  );
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "postgres" }),
    "postgres_etl",
  );
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "postgres", analyticsDatabaseUrl: "   " }),
    "postgres_etl",
  );
  assert.equal(
    resolveAnalyticsWarehouseMode({ persistence: "postgres", analyticsDatabaseUrl: "postgres://r" }),
    "postgres_replica_etl",
  );
});
