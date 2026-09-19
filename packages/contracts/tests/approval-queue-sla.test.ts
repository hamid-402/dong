import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalQueueSlaHours,
  withApprovalQueueSla,
} from "../src/finance.js";

test("approvalQueueSlaHours parses positive hours only", () => {
  assert.equal(approvalQueueSlaHours({}), null);
  assert.equal(approvalQueueSlaHours({ MAKER_CHECKER_SLA_HOURS: "" }), null);
  assert.equal(approvalQueueSlaHours({ MAKER_CHECKER_SLA_HOURS: "0" }), null);
  assert.equal(approvalQueueSlaHours({ MAKER_CHECKER_SLA_HOURS: "-1" }), null);
  assert.equal(approvalQueueSlaHours({ MAKER_CHECKER_SLA_HOURS: "abc" }), null);
  assert.equal(approvalQueueSlaHours({ MAKER_CHECKER_SLA_HOURS: "24" }), 24);
});

test("withApprovalQueueSla marks breach after due", () => {
  const createdAt = "2026-09-14T00:00:00.000Z";
  const due = withApprovalQueueSla(createdAt, 24, Date.parse("2026-09-14T12:00:00.000Z"));
  assert.equal(due.slaDueAt, "2026-09-15T00:00:00.000Z");
  assert.equal(due.slaBreached, false);

  const late = withApprovalQueueSla(createdAt, 24, Date.parse("2026-09-15T00:00:01.000Z"));
  assert.equal(late.slaBreached, true);
  assert.deepEqual(withApprovalQueueSla(createdAt, null), {});
});
