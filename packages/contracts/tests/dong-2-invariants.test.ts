import assert from "node:assert/strict";
import test from "node:test";
import { isInvoiceTotalConsistent } from "../src/billing.js";
import {
  financeManagerQuorumOk,
  inviteSatisfiesFinanceQuorum,
  readProductFeatureFlags,
  createRecurringRuleRequestSchema,
  compareReportTotals,
  workerJobNameSchema,
  createMemberAllowanceRequestSchema,
  isReadOnlyRole,
  membershipRoleSchema,
} from "../src/index.js";
import {
  allocateEqualSplit,
  computeProvisionalBalances,
  settlementSuggestionsSatisfyGoldenRules,
  suggestMinimalSettlements,
} from "../src/finance.js";

test("invoice total = shared + private", () => {
  assert.equal(
    isInvoiceTotalConsistent({
      sharedTotal: { amountMinor: "100", currency: "IRR" },
      privateTotal: { amountMinor: "40", currency: "IRR" },
      total: { amountMinor: "140", currency: "IRR" },
    }),
    true,
  );
  assert.equal(
    isInvoiceTotalConsistent({
      sharedTotal: { amountMinor: "100", currency: "IRR" },
      privateTotal: { amountMinor: "40", currency: "IRR" },
      total: { amountMinor: "139", currency: "IRR" },
    }),
    false,
  );
});

test("Law 9 finance quorum: bootstrap allows one owner", () => {
  assert.deepEqual(
    financeManagerQuorumOk({
      spaceKind: "group",
      memberCount: 1,
      financeManagerCount: 1,
    }),
    { ok: true },
  );
});

test("Law 9: second member must be finance manager when only one exists", () => {
  assert.equal(
    inviteSatisfiesFinanceQuorum({
      spaceKind: "group",
      currentMemberCount: 1,
      currentFinanceManagerCount: 1,
      inviteRole: "member",
    }).ok,
    false,
  );
  assert.equal(
    inviteSatisfiesFinanceQuorum({
      spaceKind: "group",
      currentMemberCount: 1,
      currentFinanceManagerCount: 1,
      inviteRole: "finance",
    }).ok,
    true,
  );
});

test("Law 9: personal space never requires quorum", () => {
  assert.equal(
    inviteSatisfiesFinanceQuorum({
      spaceKind: "personal",
      currentMemberCount: 1,
      currentFinanceManagerCount: 1,
      inviteRole: "member",
    }).ok,
    true,
  );
});

test("product flags: production unset → off; development unset → on", () => {
  const allOff = {
    addonAck: false,
    recurrenceWorker: false,
    debtSimplifyApi: false,
    biCompare: false,
    costCenter: false,
    allowance: false,
    expensePolicy: false,
    approvalQueue: false,
    reimbursement: false,
    categoryBudget: false,
    fxRates: false,
    expenseImport: false,
    weeklyDigest: false,
    workspacePlans: false,
    planAdmin: false,
    approvalSteps: false,
  };
  assert.deepEqual(readProductFeatureFlags({ NODE_ENV: "production" }), allOff);
  const allOn = Object.fromEntries(
    Object.keys(allOff).map((k) => [k, true]),
  );
  assert.deepEqual(readProductFeatureFlags({ NODE_ENV: "development" }), allOn);
  assert.equal(
    readProductFeatureFlags({
      NODE_ENV: "development",
      ENABLE_ADDON_ACK: "0",
    }).addonAck,
    false,
  );
  assert.equal(
    readProductFeatureFlags({ NODE_ENV: "production", ENABLE_ADDON_ACK: "1" })
      .addonAck,
    true,
  );
  const wave6 = readProductFeatureFlags({
    NODE_ENV: "production",
    ENABLE_BI_COMPARE: "1",
    ENABLE_COST_CENTER: "true",
  });
  assert.equal(wave6.biCompare, true);
  assert.equal(wave6.costCenter, true);
});

test("Wave F guest role and allowance contracts", () => {
  assert.equal(membershipRoleSchema.parse("guest"), "guest");
  assert.equal(isReadOnlyRole("guest"), true);
  const allowance = createMemberAllowanceRequestSchema.parse({
    memberUserId: "00000000-0000-4000-8000-000000000001",
    periodKind: "month",
    limit: { amountMinor: "100000", currency: "IRR" },
    idempotencyKey: "allowance-contract-test",
  });
  assert.equal(allowance.alertPct, 80);
});

test("report comparison returns signed delta and null percent for zero prior", () => {
  const base = {
    workspaceId: "ws",
    from: "2026-08-01",
    to: "2026-08-31",
    groupBy: "month" as const,
    expenseCount: 1,
    buckets: [],
  };
  assert.deepEqual(
    compareReportTotals(
      {
        ...base,
        grandTotal: { amountMinor: "150", currency: "IRR" },
      },
      {
        ...base,
        grandTotal: { amountMinor: "100", currency: "IRR" },
      },
    ),
    {
      deltaTotal: { amountMinor: "50", currency: "IRR" },
      deltaPercent: 50,
    },
  );
  assert.equal(
    compareReportTotals(
      { ...base, grandTotal: { amountMinor: "-10", currency: "IRR" } },
      { ...base, grandTotal: { amountMinor: "0", currency: "IRR" } },
    ).deltaPercent,
    null,
  );
});

test("recurrence contracts default auto-confirm off and accept worker job", () => {
  const parsed = createRecurringRuleRequestSchema.parse({
    title: "اجاره",
    amount: { amountMinor: "1000", currency: "IRR" },
    cadence: "monthly",
    nextRunOn: "2026-09-01",
    idempotencyKey: "recurrence-contract-test",
  });
  assert.equal(parsed.autoConfirm, false);
  assert.equal(workerJobNameSchema.parse("recurrence.tick"), "recurrence.tick");
});

test("suggestMinimalSettlements satisfies Dong 2.0 golden rules", () => {
  const total = { amountMinor: "300", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b", "c"]);
  const lines = computeProvisionalBalances(
    [{ paidByUserId: "a", total, splits, status: "posted" }],
    [],
  );
  const suggestions = suggestMinimalSettlements(lines);
  assert.equal(settlementSuggestionsSatisfyGoldenRules(lines, suggestions), true);
  assert.ok(suggestions.length >= 1);
});
