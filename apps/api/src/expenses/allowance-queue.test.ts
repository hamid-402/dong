import assert from "node:assert/strict";
import test from "node:test";
import { ModuleRef } from "@nestjs/core";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";
import type { AllowancesService } from "../allowances/allowances.service.js";

test("allowance over limit sets requiresApproval on createDraft", async () => {
  const prevPolicy = process.env.ENABLE_EXPENSE_POLICY;
  const prevAllow = process.env.ENABLE_ALLOWANCE;
  process.env.ENABLE_EXPENSE_POLICY = "0";
  process.env.ENABLE_ALLOWANCE = "1";
  try {
    const store = new MemoryExpenseStore();
    const allowances = {
      wouldExceedActiveAllowance: async () => true,
    } as unknown as AllowancesService;
    const moduleRef = {
      get: () => allowances,
    } as ModuleRef;

    const service = new ExpensesService(
      store,
      {
        persistence: "memory",
        get: async () => ({
          workspaceId: "w1",
          approvalThresholdMinor: null,
          requireReceiptAboveMinor: null,
        }),
        put: async () => {
          throw new Error();
        },
      },
      {} as never,
      {
        getWorkspaceForUser: async () => ({ template: "friends_family" }),
        listMembers: async () => [{ userId: "u1", role: "member" }],
      } as never,
      {
        requireAccess: async () => ({
          role: "member",
          decision: { allowed: true },
        }),
        assertNotReadOnly: () => {},
      } as never,
      { append: async () => undefined } as never,
      {} as never,
      {
        run: async (_scope: string, _user: string, _key: string, fn: () => Promise<unknown>) =>
          fn(),
      } as never,
      {} as never,
      {} as never,
      { listForTarget: async () => [] } as never,
      { createFirst: async () => null, approve: async () => {}, pending: async () => [] } as never,
      {
        assertFourEyes: async () => undefined,
        applyTierGate: async () => ({ outcome: "bypass" }),
      } as never,
      { recordUsage: async () => undefined } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      moduleRef,
    );

    const created = await service.createDraft(
      { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
      "w1",
      {
        title: "Taxi",
        total: { amountMinor: "50000", currency: "IRR" },
        paidByUserId: "u1",
        splitMethod: "equal",
        participantUserIds: ["u1"],
        occurredOn: "2026-09-07",
        idempotencyKey: "allow-1",
      },
    );
    assert.equal(created.requiresApproval, true);
    assert.match(created.note ?? "", /allowance_over_limit/);
  } finally {
    if (prevPolicy === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = prevPolicy;
    if (prevAllow === undefined) delete process.env.ENABLE_ALLOWANCE;
    else process.env.ENABLE_ALLOWANCE = prevAllow;
  }
});
