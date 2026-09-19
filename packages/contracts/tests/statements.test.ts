import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  buildMemberStatementDetail,
  computeStatementBalances,
  statementDetailToCsv,
  type ExpenseSummary,
} from "../src/index.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

test("computeStatementBalances payable vs credit", () => {
  assert.deepEqual(computeStatementBalances("1000", "400"), {
    payableMinor: "600",
    creditMinor: "0",
  });
  assert.deepEqual(computeStatementBalances("400", "1000"), {
    payableMinor: "0",
    creditMinor: "600",
  });
  assert.deepEqual(computeStatementBalances("500", "500"), {
    payableMinor: "0",
    creditMinor: "0",
  });
});

test("buildMemberStatementDetail includes weekdayFa and payable/credit", () => {
  const total = { amountMinor: "1000", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, [alice, bob]);
  const expense: ExpenseSummary = {
    id: "e1",
    workspaceId,
    title: "ناهار",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: alice,
    splitMethod: "equal",
    splits,
    participantUserIds: [alice, bob],
    paymentLines: [{ userId: alice, amount: total }],
    occurredOn: "2026-09-03", // Wednesday UTC
    createdAt: new Date().toISOString(),
  };

  const detail = buildMemberStatementDetail({
    workspaceId,
    userId: bob,
    from: "2026-09-01",
    to: "2026-09-30",
    expenses: [expense],
  });

  assert.equal(detail.totalShareMinor, "500");
  assert.equal(detail.totalPaidMinor, "0");
  assert.equal(detail.payableMinor, "500");
  assert.equal(detail.creditMinor, "0");
  assert.equal(detail.payoutInstructions, null);
  assert.ok(detail.lines[0]?.weekdayFa);
  assert.equal(detail.lines[0]?.weekdayFa, "پنجشنبه");

  const aliceDetail = buildMemberStatementDetail({
    workspaceId,
    userId: alice,
    from: "2026-09-01",
    to: "2026-09-30",
    expenses: [expense],
  });
  assert.equal(aliceDetail.totalShareMinor, "500");
  assert.equal(aliceDetail.totalPaidMinor, "1000");
  assert.equal(aliceDetail.payableMinor, "0");
  assert.equal(aliceDetail.creditMinor, "500");

  const csv = statementDetailToCsv({
    ...detail,
    payoutInstructions: {
      holderName: "علی",
      destinationKind: "card",
      destinationValue: "6393461063874330",
    },
  });
  assert.match(csv, /weekdayFa/);
  assert.match(csv, /payableMinor=500/);
  assert.match(csv, /payout.destinationValue=6393461063874330/);
});

test("weekdayFa edge dates across year boundary", () => {
  const total = { amountMinor: "200", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, [alice, bob]);
  for (const [occurredOn, expected] of [
    ["2025-12-31", "چهارشنبه"],
    ["2026-01-01", "پنجشنبه"],
    ["2026-03-20", "جمعه"],
  ] as const) {
    const expense: ExpenseSummary = {
      id: `e-${occurredOn}`,
      workspaceId,
      title: "لبه",
      status: "posted",
      visibility: "shared",
      total,
      paidByUserId: alice,
      splitMethod: "equal",
      splits,
      participantUserIds: [alice, bob],
      paymentLines: [{ userId: alice, amount: total }],
      occurredOn,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const detail = buildMemberStatementDetail({
      workspaceId,
      userId: bob,
      from: "2025-12-01",
      to: "2026-03-31",
      expenses: [expense],
    });
    assert.equal(detail.lines[0]?.weekdayFa, expected, occurredOn);
  }
});
