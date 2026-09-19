import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostingDecision } from "../src/expense-posting.js";

const base = {
  totalMinor: "1000",
  visibility: "shared" as const,
  requiresApproval: false,
  approved: false,
};

test("plain shared expense under every gate posts immediately", () => {
  const decision = resolvePostingDecision(base);
  assert.equal(decision.commit, "post");
  assert.deepEqual(decision.reasons, []);
});

test("null thresholds disable the gate", () => {
  const decision = resolvePostingDecision({
    ...base,
    approvalThresholdMinor: null,
    requireReceiptAboveMinor: null,
    makerCheckerThresholdMinor: null,
  });
  assert.equal(decision.commit, "post");
});

test("amount at or above the approval threshold waits", () => {
  const at = resolvePostingDecision({ ...base, approvalThresholdMinor: "1000" });
  assert.equal(at.commit, "await_approval");
  assert.deepEqual(at.reasons, ["over_approval_threshold"]);

  const below = resolvePostingDecision({
    ...base,
    approvalThresholdMinor: "1001",
  });
  assert.equal(below.commit, "post");
});

test("receipt policy holds the expense until an attachment exists", () => {
  const missing = resolvePostingDecision({
    ...base,
    requireReceiptAboveMinor: "500",
    hasReceipt: false,
  });
  assert.equal(missing.commit, "await_approval");
  assert.deepEqual(missing.reasons, ["receipt_required"]);

  const attached = resolvePostingDecision({
    ...base,
    requireReceiptAboveMinor: "500",
    hasReceipt: true,
  });
  assert.equal(attached.commit, "post");
});

test("G03 category receipt policy holds even below amount threshold", () => {
  const missing = resolvePostingDecision({
    ...base,
    totalMinor: "100",
    requireReceiptAboveMinor: "5000",
    requireReceiptCategoryIds: ["cat-travel"],
    categoryId: "cat-travel",
    hasReceipt: false,
  });
  assert.equal(missing.commit, "await_approval");
  assert.deepEqual(missing.reasons, ["receipt_required"]);

  const otherCat = resolvePostingDecision({
    ...base,
    totalMinor: "100",
    requireReceiptAboveMinor: "5000",
    requireReceiptCategoryIds: ["cat-travel"],
    categoryId: "cat-food",
    hasReceipt: false,
  });
  assert.equal(otherCat.commit, "post");
});

test("receipt is still required after approval", () => {
  const decision = resolvePostingDecision({
    ...base,
    approved: true,
    requiresApproval: true,
    requireReceiptAboveMinor: "500",
    hasReceipt: false,
  });
  assert.equal(decision.commit, "await_approval");
  assert.deepEqual(decision.reasons, ["receipt_required"]);
});

test("approval clears the requires-approval and threshold holds", () => {
  const decision = resolvePostingDecision({
    ...base,
    requiresApproval: true,
    approvalThresholdMinor: "100",
    approved: true,
  });
  assert.equal(decision.commit, "post");
});

test("maker cannot self-clear above the four-eyes band", () => {
  const maker = resolvePostingDecision({
    ...base,
    makerCheckerThresholdMinor: "1000",
    actorIsMaker: true,
  });
  assert.equal(maker.commit, "await_approval");
  assert.ok(maker.reasons.includes("four_eyes"));

  const checker = resolvePostingDecision({
    ...base,
    makerCheckerThresholdMinor: "1000",
    actorIsMaker: false,
  });
  assert.equal(checker.commit, "post");
});

test("company expense needs an approver role to post", () => {
  const member = resolvePostingDecision({
    ...base,
    visibility: "company",
    actorCanPostCompany: false,
  });
  assert.equal(member.commit, "await_approval");
  assert.ok(member.reasons.includes("company_needs_approver_role"));

  const approver = resolvePostingDecision({
    ...base,
    visibility: "company",
    actorCanPostCompany: true,
  });
  assert.equal(approver.commit, "post");
});

test("reasons are de-duplicated and stack", () => {
  const decision = resolvePostingDecision({
    ...base,
    requiresApproval: true,
    approvalThresholdMinor: "500",
    requireReceiptAboveMinor: "500",
    hasReceipt: false,
  });
  assert.equal(decision.commit, "await_approval");
  assert.deepEqual(new Set(decision.reasons).size, decision.reasons.length);
  assert.ok(decision.reasons.includes("requires_approval"));
  assert.ok(decision.reasons.includes("over_approval_threshold"));
  assert.ok(decision.reasons.includes("receipt_required"));
});

test("malformed threshold never blocks a posting", () => {
  const decision = resolvePostingDecision({
    ...base,
    approvalThresholdMinor: "   ",
    requireReceiptAboveMinor: "not-a-number",
  });
  assert.equal(decision.commit, "post");
});
