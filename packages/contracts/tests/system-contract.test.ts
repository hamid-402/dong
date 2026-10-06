import assert from "node:assert/strict";
import test from "node:test";
import {
  healthReadyResponseSchema,
  systemCapabilitiesSchema,
  problemDetailsSchema,
  platformSloResponseSchema,
  localPspIntentSummarySchema,
  onBehalfPaymentListSchema,
  accountDataExportSchema,
} from "../src/index.js";

test("healthReadyResponseSchema accepts ready payload", () => {
  const parsed = healthReadyResponseSchema.parse({
    status: "ready",
    service: "dang-api",
    version: "0.1.0",
    checks: {
      iam: "postgres",
      database: "ok",
      redis: "ok",
      redisConfigured: true,
      databaseConfigured: true,
    },
  });
  assert.equal(parsed.status, "ready");
});

test("systemCapabilitiesSchema accepts providers from Stage 10", () => {
  const parsed = systemCapabilitiesSchema.parse({
    version: "0.1.0",
    allowDevAuth: true,
    readiness: "ready",
    conversionLive: false,
    providers: {
      payment: "local_psp",
      paymentOnBehalf: "on_behalf_v1",
      slo: "in_app_v1",
      jobs: "redis_queue",
      outbox: "postgres",
      auditIntegrity: "hash_chain",
      accessPolicy: "role_sets_v1",
      secrets: "env",
      tracing: "local_spans",
      antifraud: "heuristics_v1",
      savingsGoals: "goals_v1",
      moneyIntents: "intents_v1",
      charts: "charts_v1",
    },
    stubs: { paymentProvider: true },
  });
  assert.equal(parsed.providers?.accessPolicy, "role_sets_v1");
  assert.equal(parsed.providers?.antifraud, "heuristics_v1");
  assert.equal(parsed.providers?.payment, "local_psp");
  assert.equal(parsed.providers?.slo, "in_app_v1");
  assert.equal(parsed.providers?.paymentOnBehalf, "on_behalf_v1");
  assert.equal(parsed.providers?.savingsGoals, "goals_v1");
  assert.equal(parsed.providers?.moneyIntents, "intents_v1");
  assert.equal(parsed.providers?.charts, "charts_v1");
});

test("systemCapabilitiesSchema accepts conversionLive true when rate table can bind IRR", () => {
  const parsed = systemCapabilitiesSchema.parse({
    version: "0.1.0",
    allowDevAuth: false,
    conversionLive: true,
    providers: { fxPreview: "preview_v1", fx: "table" },
  });
  assert.equal(parsed.conversionLive, true);
});

test("systemCapabilitiesSchema accepts fxPreview preview_v1 (G13)", () => {
  const parsed = systemCapabilitiesSchema.parse({
    version: "0.1.0",
    allowDevAuth: false,
    conversionLive: false,
    providers: { fxPreview: "preview_v1", fxProvider: "none" },
  });
  assert.equal(parsed.providers?.fxPreview, "preview_v1");
});

test("D3 depth response schemas accept honest fixtures", () => {
  const problem = problemDetailsSchema.parse({
    type: "https://dang.local/problems/not-found",
    title: "LocalPSP intent not found",
    status: 404,
  });
  assert.equal(problem.status, 404);

  const slo = platformSloResponseSchema.parse({
    provider: "in_app_v1",
    generatedAt: "2026-09-13T12:00:00.000Z",
    breached: false,
    windows: [
      {
        id: "5m",
        durationMs: 300_000,
        breached: false,
        signals: [
          {
            id: "outbox_relay",
            available: false,
            unavailableReason: "fixture",
            observed: {},
            burnRate: null,
            threshold: 1,
            breached: false,
          },
        ],
      },
    ],
    notes: ["not a Grafana replacement"],
  });
  assert.equal(slo.provider, "in_app_v1");

  const intent = localPspIntentSummarySchema.parse({
    intentId: "intent-1",
    provider: "local_psp",
    amount: { amountMinor: "1000", currency: "IRR" },
    description: "test",
    status: "pending",
    returnUrl: "http://localhost:3005/return",
    createdAt: "2026-09-13T12:00:00.000Z",
    expiresAt: "2026-09-13T13:00:00.000Z",
  });
  assert.equal(intent.provider, "local_psp");

  const list = onBehalfPaymentListSchema.parse([]);
  assert.equal(list.length, 0);

  const exported = accountDataExportSchema.parse({
    exportedAt: "2026-09-13T12:00:00.000Z",
    schemaVersion: 1,
    profile: {
      userId: "u1",
      email: "a@b.c",
      displayName: "A",
    },
    workspaces: [
      { id: "w1", name: "خانه", slug: "home", template: "household" },
    ],
    sessions: [{ id: "s1", createdAt: "2026-09-13T11:00:00.000Z" }],
    notes: ["رمز عبور صادر نمی‌شود."],
  });
  assert.equal(exported.schemaVersion, 1);
});

test("accountDataExportSchema rejects secret field leakage", () => {
  assert.throws(() =>
    accountDataExportSchema.parse({
      exportedAt: "2026-09-13T12:00:00.000Z",
      schemaVersion: 1,
      profile: {
        userId: "u1",
        email: "a@b.c",
        displayName: "A",
        passwordHash: "nope",
      },
      workspaces: [],
      sessions: [],
      notes: ["x"],
    }),
  );
});
