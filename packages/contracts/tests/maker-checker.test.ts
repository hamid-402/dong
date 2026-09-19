import assert from "node:assert/strict";
import test from "node:test";
import {
  countOpenInvites,
  evaluateInviteAnomaly,
  evaluateMakerChecker,
  evaluateSettlementAnomaly,
  evaluateTierApproval,
  INVITE_ANOMALY_MAX_EXPIRY_HOURS,
  INVITE_ELEVATED_PENDING_LIMIT,
  INVITE_PENDING_FLOOD_LIMIT,
  meetsMakerCheckerThreshold,
  resolveApprovalTier,
} from "../src/index.js";

test("meetsMakerCheckerThreshold compares bigint minors", () => {
  assert.equal(meetsMakerCheckerThreshold("100", "100"), true);
  assert.equal(meetsMakerCheckerThreshold("99", "100"), false);
  assert.equal(meetsMakerCheckerThreshold("100", null), false);
});

test("resolveApprovalTier picks highest matching band", () => {
  assert.equal(resolveApprovalTier("0").requiredApprovals, 1);
  assert.equal(resolveApprovalTier("10000000").requiredApprovals, 2);
  assert.deepEqual(resolveApprovalTier("100000000").requiredRoles, [
    "owner",
    "finance",
  ]);
});

test("evaluateTierApproval stays pending until N approvals", () => {
  const first = evaluateTierApproval({
    amountMinor: "10000000",
    makerUserId: "maker",
    approverUserId: "a1",
    approverRoles: ["admin"],
    decision: "approved",
    priorApprovedUserIds: [],
  });
  assert.equal(first.status, "pending");
  assert.equal(first.approvalsCount, 1);
  assert.equal(first.requiredApprovals, 2);

  const second = evaluateTierApproval({
    amountMinor: "10000000",
    makerUserId: "maker",
    approverUserId: "a2",
    approverRoles: ["admin"],
    decision: "approved",
    priorApprovedUserIds: ["a1"],
  });
  assert.equal(second.status, "complete");
  assert.equal(second.approvalsCount, 2);
});

test("evaluateTierApproval rejects missing required role", () => {
  const result = evaluateTierApproval({
    amountMinor: "100000000",
    makerUserId: "maker",
    approverUserId: "member1",
    approverRoles: ["member"],
    decision: "approved",
    priorApprovedUserIds: [],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "ROLE_REQUIRED");
});

test("evaluateMakerChecker enforces four-eyes above threshold", () => {
  assert.deepEqual(
    evaluateMakerChecker({
      amountMinor: "500",
      thresholdMinor: "100",
      makerUserId: "a",
      checkerUserId: "a",
    }),
    { required: true, allowed: false, code: "FOUR_EYES_REQUIRED" },
  );
  assert.equal(
    evaluateMakerChecker({
      amountMinor: "500",
      thresholdMinor: "100",
      makerUserId: "a",
      checkerUserId: "b",
    }).allowed,
    true,
  );
  assert.equal(
    evaluateMakerChecker({
      amountMinor: "50",
      thresholdMinor: "100",
      makerUserId: "a",
      checkerUserId: "a",
    }).required,
    false,
  );
});

test("evaluateSettlementAnomaly catches self-transfer and huge amounts", () => {
  assert.equal(
    evaluateSettlementAnomaly({
      amountMinor: "100",
      fromUserId: "u1",
      toUserId: "u1",
    }).ok,
    false,
  );
  assert.equal(
    evaluateSettlementAnomaly({
      amountMinor: "100",
      fromUserId: "u1",
      toUserId: "u2",
    }).ok,
    true,
  );
  assert.ok(
    evaluateSettlementAnomaly({
      amountMinor: "1000000000000001",
      fromUserId: "u1",
      toUserId: "u2",
    }).reasons.includes("AMOUNT_TOO_LARGE"),
  );
});

test("evaluateInviteAnomaly blocks sensitive role without subject", () => {
  assert.ok(
    evaluateInviteAnomaly({
      role: "finance",
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).reasons.includes("ROLE_SENSITIVE_NO_SUBJECT"),
  );
  assert.equal(
    evaluateInviteAnomaly({
      role: "member",
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).ok,
    true,
  );
  assert.equal(
    evaluateInviteAnomaly({
      role: "admin",
      invitedSubject: "a@b.co",
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).ok,
    true,
  );
});

test("evaluateInviteAnomaly catches invalid subject, self, expiry, floods", () => {
  assert.ok(
    evaluateInviteAnomaly({
      role: "member",
      invitedSubject: "not-an-email",
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).reasons.includes("SUBJECT_INVALID"),
  );
  assert.ok(
    evaluateInviteAnomaly({
      role: "member",
      invitedSubject: "me@ex.com",
      actorExternalSubject: "me@ex.com",
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).reasons.includes("SUBJECT_SELF"),
  );
  assert.ok(
    evaluateInviteAnomaly({
      role: "member",
      expiresInHours: INVITE_ANOMALY_MAX_EXPIRY_HOURS + 1,
      pendingOpenCount: 0,
      pendingElevatedCount: 0,
    }).reasons.includes("EXPIRY_TOO_LONG"),
  );
  assert.ok(
    evaluateInviteAnomaly({
      role: "member",
      pendingOpenCount: INVITE_PENDING_FLOOD_LIMIT,
      pendingElevatedCount: 0,
    }).reasons.includes("PENDING_FLOOD"),
  );
  assert.ok(
    evaluateInviteAnomaly({
      role: "admin",
      invitedSubject: "a@b.co",
      pendingOpenCount: 0,
      pendingElevatedCount: INVITE_ELEVATED_PENDING_LIMIT,
    }).reasons.includes("PENDING_ELEVATED_FLOOD"),
  );
});

test("countOpenInvites ignores accepted and expired", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const counts = countOpenInvites([
    { role: "member", expiresAt: future },
    { role: "admin", expiresAt: future },
    { role: "finance", expiresAt: future, acceptedAt: new Date().toISOString() },
    { role: "admin", expiresAt: past },
  ]);
  assert.deepEqual(counts, { open: 2, elevatedOpen: 1 });
});
