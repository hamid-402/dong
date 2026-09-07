import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { ACTOR_KEY } from "../auth/auth.guard.js";
import { RecurrenceRunGuard } from "./recurrence-run.guard.js";
import { ReportsController } from "./reports.controller.js";

test("runDue uses asOf and only auto-confirms opted-in rules", async () => {
  const calls: string[] = [];
  const reports = {
    runRecurringDue: async (
      workspaceId: string,
      actorUserId: string,
      asOf: string,
    ) => {
      calls.push(`due:${workspaceId}:${actorUserId}:${asOf}`);
      return {
        due: [
          {
            id: "rule-auto",
            title: "auto",
            amount: { amountMinor: "100", currency: "IRR" as const },
            visibility: "private" as const,
            autoConfirm: true,
            createdByUserId: "owner-1",
          },
          {
            id: "rule-draft",
            title: "draft",
            amount: { amountMinor: "200", currency: "IRR" as const },
            visibility: "private" as const,
            autoConfirm: false,
            createdByUserId: "owner-1",
          },
        ],
      };
    },
  };
  const iam = {
    listMembers: async () => [{ userId: "scheduler-1" }],
  };
  const expenses = {
    createDraft: async (
      actor: AuthActor,
      _workspaceId: string,
      body: { title: string; occurredOn: string },
    ) => {
      calls.push(`draft:${actor.userId}:${body.title}:${body.occurredOn}`);
      return { id: `expense-${body.title}`, status: "draft" };
    },
    submit: async (actor: AuthActor, _workspaceId: string, expenseId: string) => {
      calls.push(`submit:${actor.userId}:${expenseId}`);
      return { id: expenseId, status: "submitted" };
    },
    post: async (actor: AuthActor, _workspaceId: string, expenseId: string) => {
      calls.push(`post:${actor.userId}:${expenseId}`);
      return { id: expenseId, status: "posted" };
    },
  };
  const controller = new ReportsController(
    reports as never,
    iam as never,
    expenses as never,
  );
  const actor: AuthActor = {
    userId: "scheduler-1",
    externalSubject: "scheduler",
    displayName: "Scheduler",
    authMode: "dev",
  };

  const result = await controller.runDue(actor, "ws-1", "2026-10-05");

  assert.deepEqual(result.createdExpenseIds, ["expense-auto", "expense-draft"]);
  assert.ok(calls.includes("due:ws-1:scheduler-1:2026-10-05"));
  assert.ok(calls.includes("draft:owner-1:auto:2026-10-05"));
  assert.ok(calls.includes("draft:owner-1:draft:2026-10-05"));
  assert.ok(calls.includes("submit:owner-1:expense-auto"));
  assert.ok(calls.includes("post:owner-1:expense-auto"));
  assert.equal(calls.some((call) => call.includes("expense-draft") && call.startsWith("submit")), false);
});

test("recurrence internal auth takes priority over dev fallback", async () => {
  const previousFlag = process.env.ENABLE_RECURRENCE_WORKER;
  const previousToken = process.env.DANG_INTERNAL_JOB_TOKEN;
  process.env.ENABLE_RECURRENCE_WORKER = "1";
  process.env.DANG_INTERNAL_JOB_TOKEN = "test-internal-secret";
  const request: Record<string | symbol, unknown> = {
    headers: {
      "x-dang-internal-job": "test-internal-secret",
      "x-dang-internal-actor-user-id": "owner-1",
    },
  };
  const sessionAuth = {
    canActivate: async () => {
      throw new Error("session guard should not run");
    },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };

  try {
    const guard = new RecurrenceRunGuard(sessionAuth as never);
    assert.equal(await guard.canActivate(context as never), true);
    assert.equal((request[ACTOR_KEY] as AuthActor).userId, "owner-1");
  } finally {
    if (previousFlag === undefined) delete process.env.ENABLE_RECURRENCE_WORKER;
    else process.env.ENABLE_RECURRENCE_WORKER = previousFlag;
    if (previousToken === undefined) delete process.env.DANG_INTERNAL_JOB_TOKEN;
    else process.env.DANG_INTERNAL_JOB_TOKEN = previousToken;
  }
});
