import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_POLICIES,
  buildPolicyContextAttrs,
  evaluateBuiltInPoliciesForAction,
  evaluatePolicy,
  exportBuiltInPolicyAudit,
  policyActionsForAccessAction,
  policyAttrsAvailable,
  policyConditionMatches,
  type PolicyJson,
} from "../src/policy-dsl.js";

test("built-in registry has at least 5 policies with real-aligned actions", () => {
  assert.ok(BUILT_IN_POLICIES.length >= 5);
  const actions = BUILT_IN_POLICIES.map((p) => p.action);
  assert.ok(actions.includes("expense.approve"));
  assert.ok(actions.includes("settlement.dispute"));
  assert.ok(actions.includes("expense.reverse"));
  assert.ok(actions.includes("invite.create"));
  assert.ok(actions.includes("statement.export"));
});

test("evaluatePolicy: allow + all conditions", () => {
  const policy: PolicyJson = {
    policyId: "t.allow",
    effect: "allow",
    action: "invite.create",
    description: "test",
    condition: {
      all: [
        { attr: "role", op: "in", value: ["owner", "admin"] },
        { attr: "flag", op: "eq", value: "yes" },
      ],
    },
  };
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "owner", flag: "yes" } }),
    true,
  );
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "member", flag: "yes" } }),
    false,
  );
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "owner" } }),
    false,
  );
});

test("evaluatePolicy: any + deny effect", () => {
  const deny: PolicyJson = {
    policyId: "t.deny",
    effect: "deny",
    action: "x",
    description: "test",
    condition: {
      any: [
        { attr: "status", op: "eq", value: "posted" },
        { attr: "status", op: "eq", value: "reversed" },
      ],
    },
  };
  assert.equal(evaluatePolicy(deny, { attrs: { status: "posted" } }), false);
  assert.equal(evaluatePolicy(deny, { attrs: { status: "draft" } }), true);
});

test("attr ops: lt and gte", () => {
  const cond = {
    all: [
      { attr: "amountMinor", op: "gte", value: "1000" },
      { attr: "amountMinor", op: "lt", value: "5000" },
    ],
  } as const;
  assert.equal(
    policyConditionMatches(cond, { amountMinor: "1000" }),
    true,
  );
  assert.equal(
    policyConditionMatches(cond, { amountMinor: "999" }),
    false,
  );
  assert.equal(
    policyConditionMatches(cond, { amountMinor: "5000" }),
    false,
  );
});

test("builtin expense.approve matrix", () => {
  const policy = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.expense.approve")!;
  assert.equal(
    evaluatePolicy(policy, {
      attrs: { role: "approver", status: "submitted" },
    }),
    true,
  );
  assert.equal(
    evaluatePolicy(policy, {
      attrs: { role: "approver", status: "posted" },
    }),
    false,
  );
  assert.equal(
    evaluatePolicy(policy, {
      attrs: { role: "member", status: "draft" },
    }),
    false,
  );
});

test("builtin settlement.dispute: finance or party", () => {
  const policy = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.settlement.dispute")!;
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "finance" } }),
    true,
  );
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "member", isParty: true } }),
    true,
  );
  assert.equal(
    evaluatePolicy(policy, { attrs: { role: "member", isParty: false } }),
    false,
  );
});

test("builtin expense.reverse / invite.create / statement.export", () => {
  const reverse = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.expense.reverse")!;
  const invite = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.invite.create")!;
  const exportPol = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.statement.export")!;

  assert.equal(evaluatePolicy(reverse, { attrs: { role: "member" } }), true);
  assert.equal(evaluatePolicy(reverse, { attrs: { role: "guest" } }), false);

  assert.equal(evaluatePolicy(invite, { attrs: { role: "admin" } }), true);
  assert.equal(evaluatePolicy(invite, { attrs: { role: "finance" } }), false);

  assert.equal(
    evaluatePolicy(exportPol, { attrs: { role: "member", isSelf: true } }),
    true,
  );
  assert.equal(
    evaluatePolicy(exportPol, { attrs: { role: "auditor" } }),
    true,
  );
  assert.equal(
    evaluatePolicy(exportPol, { attrs: { role: "member", isSelf: false } }),
    false,
  );
});

test("exportBuiltInPolicyAudit is honest for auditor", () => {
  const audit = exportBuiltInPolicyAudit("auditor");
  assert.equal(audit.source, "builtin_registry");
  assert.equal(audit.actorRole, "auditor");
  assert.equal(audit.policies.length, BUILT_IN_POLICIES.length);
  const invite = audit.policies.find((p) => p.action === "invite.create")!;
  assert.equal(invite.roleOnlyAllows, false);
  assert.match(invite.noteForActor, /owner\/admin|دعوت/);
  const stmt = audit.policies.find((p) => p.action === "statement.export")!;
  assert.equal(stmt.roleOnlyAllows, true);
});

test("evaluateBuiltInPoliciesForAction denies expense.approve when status fails DSL", () => {
  const denied = evaluateBuiltInPoliciesForAction({
    action: "expense.approve",
    attrs: { role: "finance", status: "cancelled" },
  });
  assert.equal(denied.allowed, false);
  if (!denied.allowed) {
    assert.equal(denied.policyId, "builtin.expense.approve");
  }

  const allowed = evaluateBuiltInPoliciesForAction({
    action: "expense.approve",
    attrs: { role: "finance", status: "submitted" },
  });
  assert.equal(allowed.allowed, true);
});

test("evaluateBuiltInPoliciesForAction skips when attrs incomplete", () => {
  const policy = BUILT_IN_POLICIES.find((p) => p.policyId === "builtin.expense.approve")!;
  assert.equal(policyAttrsAvailable(policy, { role: "finance" }), false);
  const skipped = evaluateBuiltInPoliciesForAction({
    action: "expense.approve",
    attrs: { role: "finance" },
  });
  assert.equal(skipped.allowed, true);
});

test("policyActionsForAccessAction maps expense.create to reverse", () => {
  assert.deepEqual(policyActionsForAccessAction("expense.create"), [
    "expense.create",
    "expense.reverse",
  ]);
  assert.deepEqual(policyActionsForAccessAction("invite.create"), ["invite.create"]);
});

test("buildPolicyContextAttrs derives isSelf from ownerUserId", () => {
  assert.deepEqual(
    buildPolicyContextAttrs("member", "u1", { ownerUserId: "u1" }),
    { role: "member", isSelf: true },
  );
  assert.deepEqual(
    buildPolicyContextAttrs("member", "u1", { ownerUserId: "u2" }),
    { role: "member", isSelf: false },
  );
});
