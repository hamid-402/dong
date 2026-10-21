import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichNotificationMetadata,
  notificationActionsForEvent,
  serializeNotificationActions,
} from "../src/notification-actions.js";

test("notificationActionsForEvent maps approval, settle, open and unknown events", () => {
  assert.deepEqual(notificationActionsForEvent(undefined), []);
  assert.deepEqual(notificationActionsForEvent(""), []);
  for (const e of ["approval.pending", "approval.needed", "expense.submitted"]) {
    assert.deepEqual(notificationActionsForEvent(e), ["approve", "open"]);
  }
  for (const e of ["group.debt.alert", "group.debt.remind", "settlement.proposed"]) {
    assert.deepEqual(notificationActionsForEvent(e), ["settle", "open"]);
  }
  for (const e of [
    "expense.posted",
    "expense.approved",
    "expense.rejected",
    "settlement.confirmed",
    "proposal.created",
    "proposal.accepted",
    "statement.ready",
    "invite.remind",
    "invite.accepted",
    "personal.budget.alert",
  ]) {
    assert.deepEqual(notificationActionsForEvent(e), ["open"]);
  }
  assert.deepEqual(notificationActionsForEvent("something.else"), []);
});

test("serializeNotificationActions joins or returns undefined when empty", () => {
  assert.equal(serializeNotificationActions([]), undefined);
  assert.equal(serializeNotificationActions(["approve", "open"]), "approve,open");
});

test("enrichNotificationMetadata adds actions without mutating or overriding", () => {
  assert.equal(enrichNotificationMetadata(undefined), undefined);

  const input = { event: "expense.submitted", k: "v" };
  const out = enrichNotificationMetadata(input);
  assert.deepEqual(out, { event: "expense.submitted", k: "v", actions: "approve,open" });
  assert.equal("actions" in input, false);

  const preset = { event: "expense.submitted", actions: "custom" };
  assert.equal(enrichNotificationMetadata(preset), preset);

  const unknown = { event: "nope" };
  assert.equal(enrichNotificationMetadata(unknown), unknown);

  const noEvent = { other: "x" };
  assert.equal(enrichNotificationMetadata(noEvent), noEvent);
});
