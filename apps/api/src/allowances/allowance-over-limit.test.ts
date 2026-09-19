import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAllowanceOverLimit } from "./allowance-over-limit.js";

test("evaluateAllowanceOverLimit when posted usage plus new amount exceeds limit", () => {
  const result = evaluateAllowanceOverLimit({
    allowances: [
      {
        id: "a1",
        workspaceId: "w1",
        memberUserId: "u1",
        periodKind: "month",
        limit: { amountMinor: "10000", currency: "IRR" },
        alertPct: 80,
        active: true,
        createdByUserId: "admin",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    expenses: [
      {
        id: "e1",
        workspaceId: "w1",
        title: "Prior",
        status: "posted",
        visibility: "shared",
        total: { amountMinor: "9000", currency: "IRR" },
        paidByUserId: "u1",
        paymentLines: [],
        splitMethod: "equal",
        participantUserIds: ["u1"],
        splits: [],
        occurredOn: "2026-09-07",
        createdAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    memberUserId: "u1",
    addedMinor: "2000",
    occurredOn: "2026-09-07",
    now: new Date("2026-09-07T12:00:00.000Z"),
  });
  assert.equal(result.overLimit, true);
  assert.equal(result.limitMinor, "10000");
});
