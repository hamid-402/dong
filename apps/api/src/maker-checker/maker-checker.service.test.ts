import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { MemorySecurityEventsStore } from "../security-events/memory-security-events.store.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { MemoryApprovalDecisionStore } from "./memory-approval-decision.store.js";
import { MakerCheckerService } from "./maker-checker.service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const maker = "22222222-2222-4222-8222-222222222222";
const same = maker;

test("assertFourEyes emits access.maker_checker_denied security event", async () => {
  const prevFlag = process.env.ENABLE_MAKER_CHECKER;
  const prevThreshold = process.env.MAKER_CHECKER_THRESHOLD_MINOR;
  process.env.ENABLE_MAKER_CHECKER = "1";
  process.env.MAKER_CHECKER_THRESHOLD_MINOR = "100000";

  try {
    const store = new MemorySecurityEventsStore();
    const events = new SecurityEventsService(store);
    const svc = new MakerCheckerService(undefined, events);

    await assert.rejects(
      () =>
        svc.assertFourEyes({
          workspaceId,
          actorUserId: same,
          makerUserId: maker,
          amountMinor: "250000",
          actionLabel: "تسویه",
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );

    await Promise.resolve();
    const page = await events.listRecent({ limit: 10 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.event, "access.maker_checker_denied");
    assert.equal(page.items[0]?.workspaceId, workspaceId);
    assert.equal(page.items[0]?.reason, "FOUR_EYES_REQUIRED");
  } finally {
    if (prevFlag === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = prevFlag;
    if (prevThreshold === undefined) delete process.env.MAKER_CHECKER_THRESHOLD_MINOR;
    else process.env.MAKER_CHECKER_THRESHOLD_MINOR = prevThreshold;
  }
});

test("assertFourEyes allows distinct checker without emitting", async () => {
  const prevFlag = process.env.ENABLE_MAKER_CHECKER;
  const prevThreshold = process.env.MAKER_CHECKER_THRESHOLD_MINOR;
  process.env.ENABLE_MAKER_CHECKER = "1";
  process.env.MAKER_CHECKER_THRESHOLD_MINOR = "100000";

  try {
    const store = new MemorySecurityEventsStore();
    const events = new SecurityEventsService(store);
    const svc = new MakerCheckerService(undefined, events);

    await svc.assertFourEyes({
      workspaceId,
      actorUserId: "33333333-3333-4333-8333-333333333333",
      makerUserId: maker,
      amountMinor: "250000",
      actionLabel: "تسویه",
    });

    await Promise.resolve();
    const page = await events.listRecent({ limit: 10 });
    assert.equal(page.items.length, 0);
  } finally {
    if (prevFlag === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = prevFlag;
    if (prevThreshold === undefined) delete process.env.MAKER_CHECKER_THRESHOLD_MINOR;
    else process.env.MAKER_CHECKER_THRESHOLD_MINOR = prevThreshold;
  }
});

test("recordTierDecision stays pending until requiredApprovals", async () => {
  const decisions = new MemoryApprovalDecisionStore();
  const svc = new MakerCheckerService(undefined, undefined, decisions);
  const requestId = "44444444-4444-4444-8444-444444444444";
  const a1 = "55555555-5555-4555-8555-555555555555";
  const a2 = "66666666-6666-4666-8666-666666666666";

  const first = await svc.recordTierDecision({
    workspaceId,
    requestType: "expense",
    requestId,
    amountMinor: "10000000",
    makerUserId: maker,
    approverUserId: a1,
    approverRoles: ["admin"],
    decision: "approved",
  });
  assert.equal(first.status, "pending");
  assert.equal(first.approvalsCount, 1);
  assert.equal(first.requiredApprovals, 2);

  const second = await svc.recordTierDecision({
    workspaceId,
    requestType: "expense",
    requestId,
    amountMinor: "10000000",
    makerUserId: maker,
    approverUserId: a2,
    approverRoles: ["admin"],
    decision: "approved",
  });
  assert.equal(second.status, "complete");
  assert.equal(second.approvalsCount, 2);

  const rows = await decisions.listForRequest(workspaceId, "expense", requestId);
  assert.equal(rows.length, 2);
});

test("recordTierDecision rejects role outside tier matrix", async () => {
  const decisions = new MemoryApprovalDecisionStore();
  const eventsStore = new MemorySecurityEventsStore();
  const events = new SecurityEventsService(eventsStore);
  const svc = new MakerCheckerService(undefined, events, decisions);
  const requestId = "77777777-7777-4777-8777-777777777777";

  await assert.rejects(
    () =>
      svc.recordTierDecision({
        workspaceId,
        requestType: "settlement",
        requestId,
        amountMinor: "100000000",
        makerUserId: maker,
        approverUserId: "88888888-8888-4888-8888-888888888888",
        approverRoles: ["member"],
        decision: "approved",
      }),
    (err: unknown) =>
      err instanceof ForbiddenException &&
      (err.getResponse() as { code?: string }).code === "ROLE_REQUIRED",
  );

  await Promise.resolve();
  const page = await events.listRecent({ limit: 5 });
  assert.equal(page.items[0]?.reason, "ROLE_REQUIRED");
});

test("applyTierGate bypasses single-approver self-approve", async () => {
  const prevFlag = process.env.ENABLE_MAKER_CHECKER;
  process.env.ENABLE_MAKER_CHECKER = "1";
  try {
    const decisions = new MemoryApprovalDecisionStore();
    const svc = new MakerCheckerService(undefined, undefined, decisions);
    const gate = await svc.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      amountMinor: "1000",
      makerUserId: maker,
      approverUserId: maker,
      approverRoles: ["member"],
      decision: "approved",
    });
    assert.equal(gate.outcome, "bypass");
    const rows = await decisions.listForRequest(
      workspaceId,
      "expense",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    assert.equal(rows.length, 0);
  } finally {
    if (prevFlag === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = prevFlag;
  }
});

test("applyTierGate stays pending then finalizes for two-approver band", async () => {
  const prevFlag = process.env.ENABLE_MAKER_CHECKER;
  process.env.ENABLE_MAKER_CHECKER = "1";
  try {
    const decisions = new MemoryApprovalDecisionStore();
    const svc = new MakerCheckerService(undefined, undefined, decisions);
    const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const a1 = "55555555-5555-4555-8555-555555555555";
    const a2 = "66666666-6666-4666-8666-666666666666";

    const first = await svc.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId,
      amountMinor: "10000000",
      makerUserId: maker,
      approverUserId: a1,
      approverRoles: ["admin"],
      decision: "approved",
    });
    assert.equal(first.outcome, "pending");
    if (first.outcome === "pending") {
      assert.equal(first.evaluation.approvalsCount, 1);
      assert.equal(first.evaluation.requiredApprovals, 2);
    }

    const second = await svc.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId,
      amountMinor: "10000000",
      makerUserId: maker,
      approverUserId: a2,
      approverRoles: ["admin"],
      decision: "approved",
    });
    assert.equal(second.outcome, "finalize");
  } finally {
    if (prevFlag === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = prevFlag;
  }
});
