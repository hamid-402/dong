import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_POLICY_VERSION,
  evaluateAccessPolicy,
} from "../src/index.js";

test("policy version is rbac_abac_v4", () => {
  assert.equal(ACCESS_POLICY_VERSION, "rbac_abac_v4");
});

test("matrix: expense.approve deny/allow", () => {
  assert.equal(
    evaluateAccessPolicy({
      role: "approver",
      action: "expense.approve",
      resource: { status: "submitted" },
    }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "approver",
      action: "expense.approve",
      resource: { status: "posted" },
    }).code,
    "DENY_ATTRIBUTE",
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "guest",
      action: "expense.approve",
      resource: { status: "submitted" },
    }).code,
    "DENY_ROLE",
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "member",
      action: "expense.approve",
      resource: { status: "submitted" },
    }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "finance",
      action: "expense.approve",
      resource: { status: "draft" },
    }).allowed,
    true,
  );
});

test("matrix: settlement.confirm deny/allow", () => {
  assert.equal(
    evaluateAccessPolicy({
      role: "auditor",
      action: "settlement.confirm",
      resource: { status: "claimed" },
    }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "member",
      action: "settlement.confirm",
      resource: { status: "confirmed" },
    }).code,
    "DENY_ATTRIBUTE",
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "member",
      action: "settlement.confirm",
      resource: { status: "claimed" },
    }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "guest",
      action: "settlement.confirm",
      resource: { status: "pending" },
    }).code,
    "DENY_ROLE",
  );
});

test("matrix: invite.create deny/allow", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "admin", action: "invite.create" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "owner", action: "invite.create" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "invite.create" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "invite.create" }).code,
    "DENY_ROLE",
  );
});

test("expense.create and settlement.claim deny read-only", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "guest", action: "expense.create" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "expense.create" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "auditor", action: "settlement.claim" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "settlement.claim" }).allowed,
    true,
  );
});

test("finance.manage is finance-manager roles", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "finance.manage" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "owner", action: "finance.manage" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "approver", action: "finance.manage" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "finance.manage" }).code,
    "DENY_ROLE",
  );
});

test("expense.read_private is owner or finance manager", () => {
  const owner = evaluateAccessPolicy({
    role: "member",
    action: "expense.read_private",
    subjectUserId: "u1",
    resource: { ownerUserId: "u1", visibility: "private" },
  });
  assert.equal(owner.allowed, true);

  const peer = evaluateAccessPolicy({
    role: "member",
    action: "expense.read_private",
    subjectUserId: "u2",
    resource: { ownerUserId: "u1", visibility: "private" },
  });
  assert.equal(peer.allowed, false);
  assert.equal(peer.code, "DENY_OWNERSHIP");

  const finance = evaluateAccessPolicy({
    role: "finance",
    action: "expense.read_private",
    subjectUserId: "u2",
    resource: { ownerUserId: "u1", visibility: "private" },
  });
  assert.equal(finance.allowed, true);
});

test("saas.invoice.manage and jobs.dlq", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "saas.invoice.manage" })
      .allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "auditor", action: "saas.invoice.manage" })
      .allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "owner", action: "jobs.dlq" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "jobs.dlq" }).allowed,
    false,
  );
});

test("workspace.mutate blocks guest/auditor", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "guest", action: "workspace.mutate" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "workspace.mutate" }).allowed,
    true,
  );
});

test("statement.read_any and statement.export matrix", () => {
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "statement.read_self" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "member", action: "statement.read_any" }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "statement.read_any" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "auditor", action: "statement.read_any" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "member",
      action: "statement.export",
      subjectUserId: "u1",
      resource: { ownerUserId: "u1" },
    }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({
      role: "member",
      action: "statement.export",
      subjectUserId: "u1",
      resource: { ownerUserId: "u2" },
    }).allowed,
    false,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "owner", action: "payout.manage" }).allowed,
    true,
  );
  assert.equal(
    evaluateAccessPolicy({ role: "finance", action: "payout.manage" }).allowed,
    false,
  );
});
