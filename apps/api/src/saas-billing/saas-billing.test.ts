import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SAAS_PLAN_PRICE_IRR_MINOR,
  currentUtcPeriodMonth,
  saasPlanPrice,
} from "@dang/contracts";
import { MemorySaasBillingStore } from "./saas-billing.store.js";
import { SaasBillingService } from "./saas-billing.service.js";

test("saas plan catalog prices are positive for paid tiers", () => {
  assert.equal(SAAS_PLAN_PRICE_IRR_MINOR.free, "0");
  assert.ok(BigInt(SAAS_PLAN_PRICE_IRR_MINOR.pro) > 0n);
  assert.ok(BigInt(SAAS_PLAN_PRICE_IRR_MINOR.business) > 0n);
  assert.equal(saasPlanPrice("pro").currency, "IRR");
});

test("currentUtcPeriodMonth is YYYY-MM", () => {
  assert.match(currentUtcPeriodMonth(new Date("2026-09-12T12:00:00Z")), /^2026-09$/);
});

test("MemorySaasBillingStore idempotent create + pay map (R10-21)", async () => {
  const store = new MemorySaasBillingStore();
  const a = await store.createInvoice({
    workspaceId: "w1",
    periodMonth: "2026-09",
    targetPlan: "pro",
    amountMinor: SAAS_PLAN_PRICE_IRR_MINOR.pro,
    status: "issued",
    note: "test",
    idempotencyKey: "k1",
    payable: false,
  });
  const b = await store.createInvoice({
    workspaceId: "w1",
    periodMonth: "2026-09",
    targetPlan: "pro",
    amountMinor: SAAS_PLAN_PRICE_IRR_MINOR.pro,
    status: "issued",
    note: "test",
    idempotencyKey: "k1",
    payable: false,
  });
  assert.equal(a.id, b.id);
  assert.equal(a.payable, false);
  await store.attachPaymentLink("w1", a.id, "plink-1");
  const mapped = await store.findInvoiceIdByPaymentLink("plink-1");
  assert.deepEqual(mapped, { workspaceId: "w1", invoiceId: a.id });
  const paid = await store.markPaid("w1", a.id);
  assert.equal(paid.status, "paid");
  assert.ok(paid.paidAt);
});

test("G15 depth SaasBillingService.usage reads real seats + expenses", async () => {
  const store = new MemorySaasBillingStore();
  const period = currentUtcPeriodMonth();
  const expenses = {
    listForWorkspace: async () => [
      { status: "posted", occurredOn: `${period}-10` },
      { status: "posted", occurredOn: `${period}-11` },
      { status: "draft", occurredOn: `${period}-12` },
      { status: "posted", occurredOn: "2020-01-01" },
    ],
  };
  const iam = {
    listMembers: async () => [
      { userId: "u1", role: "owner" },
      { userId: "u2", role: "member" },
    ],
  };
  const access = { requireMember: async () => undefined };
  const payments = {};
  const plans = {
    getPlan: async () => ({ plan: "pro" as const, seatsLimit: 10 }),
  };
  const service = new SaasBillingService(
    store,
    iam as never,
    expenses as never,
    access as never,
    payments as never,
    plans as never,
  );
  const usage = await service.usage(
    {
      userId: "u1",
      externalSubject: "s",
      displayName: "n",
      authMode: "dev",
    },
    "w1",
  );
  assert.equal(usage.seatsUsed, 2);
  assert.equal(usage.seatsLimit, 10);
  assert.equal(usage.postedExpensesInPeriod, 2);
  assert.equal(usage.periodMonth, period);
});
