/**
 * RES-02 — attribute ABAC depth (local evaluator only; remote PDP not claimed).
 * Residual: no remote PDP / field-level — see docs/security/PENTEST-REMEDIATION-TRACKER.md.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAccessPolicy } from "../src/index.js";

test("RES-02: DENY_ATTRIBUTE when required status is incompatible (expense.approve)", () => {
  const posted = evaluateAccessPolicy({
    role: "approver",
    action: "expense.approve",
    resource: { status: "posted" },
  });
  assert.equal(posted.allowed, false);
  assert.equal(posted.code, "DENY_ATTRIBUTE");

  const reversed = evaluateAccessPolicy({
    role: "finance",
    action: "expense.approve",
    resource: { status: "reversed" },
  });
  assert.equal(reversed.code, "DENY_ATTRIBUTE");
});

test("RES-02: DENY when private-read ownership attribute absent/mismatch", () => {
  const absentOwner = evaluateAccessPolicy({
    role: "member",
    action: "expense.read_private",
    subjectUserId: "user-a",
    resource: {},
  });
  assert.equal(absentOwner.allowed, false);
  assert.equal(absentOwner.code, "DENY_OWNERSHIP");

  const mismatch = evaluateAccessPolicy({
    role: "member",
    action: "expense.read_private",
    subjectUserId: "user-a",
    resource: { ownerUserId: "user-b" },
  });
  assert.equal(mismatch.allowed, false);
  assert.equal(mismatch.code, "DENY_OWNERSHIP");
});

test("RES-02: settlement.confirm DENY_ATTRIBUTE on incompatible status", () => {
  const decision = evaluateAccessPolicy({
    role: "member",
    action: "settlement.confirm",
    resource: { status: "confirmed" },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "DENY_ATTRIBUTE");
});

test("RES-02: settlement.dispute DENY when isParty explicitly false", () => {
  const decision = evaluateAccessPolicy({
    role: "member",
    action: "settlement.dispute",
    resource: { isParty: false, status: "claimed" },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "DENY_OWNERSHIP");
});

/**
 * approvalCapMinor boundary is enforced in WorkspaceAccessService (deputy window),
 * covered by apps/api/src/iam/workspace-access.policy-dsl.test.ts — not remote PDP.
 */
test("RES-02 residual note: local ABAC only (no remote PDP claim)", () => {
  assert.ok(true, "remote PDP / field-level ABAC remain residual");
});
